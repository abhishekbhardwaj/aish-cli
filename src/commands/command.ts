/**
 * Command Generation and Execution
 *
 * AI-powered command generation that analyzes user queries, generates appropriate
 * shell commands, evaluates safety, and provides failure analysis with alternatives.
 */

import chalk from "chalk";
import { input, password } from "@inquirer/prompts";
import { spawn } from "child_process";
import { z } from "zod";
import { Command } from "commander";
import os from "os";
import { loadConfig } from "../config/config";
import type { LanguageModel, ModelMessage } from "ai";
import { loading } from "../components/ui/loading";
import { generateStructured, generateAIText } from "../config/ai";

/**
 * Schema for command analysis response
 */
const CommandAnalysisSchema = z.object({
  command: z.string().describe("The shell command to execute"),
  explanation: z
    .string()
    .describe("Brief explanation of what the command does"),
  isDangerous: z
    .boolean()
    .describe("Whether the command is potentially dangerous or destructive"),
  requiresExternalPackages: z
    .boolean()
    .describe("Whether the command requires external packages to be installed"),
  externalPackages: z
    .array(z.string())
    .optional()
    .describe("List of external packages required, if any"),
  needsInteractiveMode: z
    .boolean()
    .describe(
      "Whether the user's intent is to run an interactive program that needs TTY",
    ),
});

/**
 * Schema for failure analysis response
 */
const FailureAnalysisSchema = z.object({
  explanation: z
    .string()
    .describe("Brief explanation of why the command failed"),
  solution: z
    .string()
    .describe("How to fix the issue or what the user should do"),
  alternativeCommand: z
    .string()
    .nullable()
    .describe(
      "Alternative command to try - should almost always be provided unless truly impossible",
    ),
  needsInteractiveMode: z
    .boolean()
    .describe(
      "Whether the alternative command needs TTY/interactive mode - only true if the failure was clearly due to missing TTY and the alternative requires it",
    ),
});

export type CommandAnalysis = z.infer<typeof CommandAnalysisSchema>;
export type FailureAnalysis = z.infer<typeof FailureAnalysisSchema>;

/**
 * Command execution states
 */
enum CommandState {
  ANALYZING = "analyzing",
  CONFIRMING = "confirming",
  EXECUTING = "executing",
  FAILED = "failed",
  SUCCESS = "success",
  ABORTED = "aborted",
}

/**
 * User action types
 */
enum UserAction {
  APPROVE = "approve",
  REJECT = "reject",
  MODIFY = "modify",
}

/**
 * Command execution context
 */
interface CommandContext {
  state: CommandState;
  query: string;
  originalQuery: string;
  conversationHistory: ModelMessage[];
  currentAnalysis?: CommandAnalysis;
  lastError?: {
    command: string;
    exitCode: number;
    stdout: string;
    stderr: string;
  };
  isSudoRetry?: boolean;
  sudoAttempts?: number;
  // Added for extended features
  attemptCount: number; // number of failed executions so far
  maxTries: number; // maximum failures allowed
  failures: Array<{
    command: string;
    exitCode: number;
    stdout: string;
    stderr: string;
    explanation?: string;
    solution?: string;
    alternativeCommand?: string;
  }>;
  autoApprove: boolean;
  jsonMode: boolean;
  abortedReason?: string;
}

/**
 * Command executor with state management
 */
class CommandExecutor {
  private model: LanguageModel;
  private timeoutMs?: number;
  private verbose: boolean;
  private forceTTY: boolean;
  private autoApprove: boolean;
  private maxTries: number;
  private jsonMode: boolean;

  constructor(
    model: LanguageModel,
    timeoutMs?: number,
    verbose: boolean = false,
    forceTTY: boolean = false,
    autoApprove: boolean = false,
    maxTries: number = 3,
    jsonMode: boolean = false,
  ) {
    this.model = model;
    this.timeoutMs = timeoutMs;
    this.verbose = verbose;
    this.forceTTY = forceTTY;
    this.autoApprove = autoApprove;
    this.maxTries = maxTries;
    this.jsonMode = jsonMode;
  }

  /**
   * Main execution loop with state machine
   */
  async execute(query: string): Promise<void> {
    const context: CommandContext = {
      state: CommandState.ANALYZING,
      query,
      originalQuery: query,
      conversationHistory: [],
      attemptCount: 0,
      maxTries: this.maxTries,
      failures: [],
      autoApprove: this.autoApprove,
      jsonMode: this.jsonMode,
    };

    while (
      context.state !== CommandState.SUCCESS &&
      context.state !== CommandState.ABORTED
    ) {
      try {
        await this.processState(context);
      } catch (error) {
        console.log(
          chalk.red(
            `❌ Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
          ),
        );
        context.abortedReason ||= "unexpected-error";
        context.state = CommandState.ABORTED;
      }
    }

    // Emit JSON summary if requested
    if (context.jsonMode) {
      const summary = {
        status: context.state,
        success: context.state === CommandState.SUCCESS,
        abortedReason: context.abortedReason,
        originalQuery: context.originalQuery,
        finalQuery: context.query,
        finalCommand: context.currentAnalysis?.command || context.lastError?.command,
        explanation: context.currentAnalysis?.explanation,
        attempts: context.attemptCount,
        failures: context.failures.map((f) => ({
          command: f.command,
          exitCode: f.exitCode,
          explanation: f.explanation,
          solution: f.solution,
          alternativeCommand: f.alternativeCommand,
          stderr: f.stderr,
          stdout: f.stdout,
        })),
        alternativesTried: context.failures.filter((f) => f.alternativeCommand).length,
      };
      // Ensure single line JSON for easier parsing
      console.log(JSON.stringify(summary));
    }
  }

  /**
   * Process current state and transition to next
   */
  private async processState(context: CommandContext): Promise<void> {
    switch (context.state) {
      case CommandState.ANALYZING:
        await this.handleAnalyzing(context);
        break;

      case CommandState.CONFIRMING:
        await this.handleConfirming(context);
        break;

      case CommandState.EXECUTING:
        await this.handleExecuting(context);
        break;

      case CommandState.FAILED:
        await this.handleFailed(context);
        break;
    }
  }

  /**
   * Handle command analysis state
   */
  private async handleAnalyzing(context: CommandContext): Promise<void> {
    const analysis = await this.analyzeCommand(
      context.query,
      context.conversationHistory,
    );

    context.currentAnalysis = analysis;
    this.displayCommandAnalysis(analysis);

    if (analysis.isDangerous) {
      context.abortedReason = "dangerous-command";
      context.state = CommandState.ABORTED;
      return;
    }

    context.state = CommandState.CONFIRMING;
  }

  /**
   * Handle user confirmation state
   */
  private async handleConfirming(context: CommandContext): Promise<void> {
    if (!context.currentAnalysis) {
      context.abortedReason = context.abortedReason || "missing-analysis";
      context.state = CommandState.ABORTED;
      return;
    }

    // Auto-approve path (non-interactive)
    if (context.autoApprove) {
      context.state = CommandState.EXECUTING;
      return;
    }

    const userAction = await this.promptUser(context.currentAnalysis.command);

    switch (userAction.type) {
      case UserAction.APPROVE:
        context.state = CommandState.EXECUTING;
        break;

      case UserAction.REJECT:
        context.abortedReason = context.abortedReason || "user-rejected";
        context.state = CommandState.ABORTED;
        break;

      case UserAction.MODIFY:
        if (userAction.input) {
          console.log(
            chalk.gray(`Refining command based on: "${userAction.input}"`),
          );
          this.updateConversationHistory(context, userAction.input);
          context.query = userAction.input;
          context.state = CommandState.ANALYZING;
        }
        break;
    }
  }

  /**
   * Handle command execution state
   */
  private async handleExecuting(context: CommandContext): Promise<void> {
    if (!context.currentAnalysis) {
      context.abortedReason = context.abortedReason || "missing-analysis";
      context.state = CommandState.ABORTED;
      return;
    }

    const result = await this.executeCommand(
      context.currentAnalysis.command,
      context.currentAnalysis.needsInteractiveMode,
      context.isSudoRetry,
    );

    // Reset sudo retry flag after use
    context.isSudoRetry = false;

    if (result.exitCode === 0) {
      // Reset sudo attempts on success
      context.sudoAttempts = 0;
      context.state = CommandState.SUCCESS;
    } else {
      context.lastError = {
        command: context.currentAnalysis.command,
        ...result,
      };
      // Count this failed attempt
      context.attemptCount += 1;
      context.state = CommandState.FAILED;
    }
  }

  /**
   * Handle command failure state
   */
  private async handleFailed(context: CommandContext): Promise<void> {
    if (!context.lastError || !context.currentAnalysis) {
      context.abortedReason = context.abortedReason || "missing-error-context";
      context.state = CommandState.ABORTED;
      return;
    }

    // Handle timeout specifically
    if (context.lastError.exitCode === 124) {
      console.log(chalk.red("timed out"));
      context.failures.push({
        command: context.lastError.command,
        exitCode: context.lastError.exitCode,
        stdout: context.lastError.stdout,
        stderr: context.lastError.stderr,
        explanation: "Command timed out",
        solution: "Increase timeout or optimize command",
      });
      context.abortedReason = context.abortedReason || "timeout";
      context.state = CommandState.ABORTED;
      return;
    }

    // Handle sudo authentication failures specifically
    if (
      context.lastError.stderr.includes("Sorry, try again") ||
      context.lastError.stderr.includes("incorrect password") ||
      context.lastError.stderr.includes("authentication failure")
    ) {
      console.log(
        chalk.red("\nAuthentication failed. Incorrect sudo password."),
      );

      // Track sudo attempts
      context.sudoAttempts = (context.sudoAttempts || 0) + 1;

      // Record this failure attempt
      context.failures.push({
        command: context.lastError.command,
        exitCode: context.lastError.exitCode,
        stdout: context.lastError.stdout,
        stderr: context.lastError.stderr,
        explanation: "Authentication failed (incorrect sudo password)",
      });

      // Allow retry with same command (up to 3 attempts total)
      if (context.currentAnalysis && context.sudoAttempts < 3) {
        console.log(chalk.gray("Try again with the correct password."));
        context.isSudoRetry = true;
        // Loop guard check before retrying
        if (context.attemptCount >= context.maxTries) {
          console.log(
            chalk.red(`Max tries (${context.maxTries}) reached.`),
          );
          context.abortedReason = context.abortedReason || "max-tries-exceeded";
          context.state = CommandState.ABORTED;
          return;
        }
        context.state = CommandState.EXECUTING; // Skip confirmation, go directly to execution
        return;
      } else if (context.sudoAttempts >= 3) {
        console.log(chalk.red("sudo: 3 incorrect password attempts"));
        context.abortedReason = context.abortedReason || "sudo-auth-failed";
        context.state = CommandState.ABORTED;
        return;
      }
    }

    // Handle other permission errors
    if (this.isPermissionError(context.lastError.stderr)) {
      console.log(
        chalk.red(
          "\nPermission denied. Attempting analysis for alternative (e.g., with sudo)",
        ),
      );
      // Continue to failure analysis instead of aborting
    }

    try {
      const failureAnalysis = await this.analyzeFailure(
        context.lastError,
        context.query,
        context.conversationHistory,
      );

      this.displayFailureAnalysis(failureAnalysis);

      // Always add failure context to conversation history
      this.addFailureToHistory(context, failureAnalysis);

      // Record failure details
      context.failures.push({
        command: context.lastError.command,
        exitCode: context.lastError.exitCode,
        stdout: context.lastError.stdout,
        stderr: context.lastError.stderr,
        explanation: failureAnalysis.explanation,
        solution: failureAnalysis.solution,
        alternativeCommand: failureAnalysis.alternativeCommand || undefined,
      });

      // Loop guard after recording failure
      if (context.attemptCount >= context.maxTries) {
        console.log(chalk.red(`Max tries (${context.maxTries}) reached.`));
        context.abortedReason = context.abortedReason || "max-tries-exceeded";
        context.state = CommandState.ABORTED;
        return;
      }

      if (failureAnalysis.alternativeCommand) {
        // Update context for alternative command
        context.currentAnalysis = {
          ...context.currentAnalysis,
          command: failureAnalysis.alternativeCommand,
          explanation: failureAnalysis.solution,
          needsInteractiveMode: failureAnalysis.needsInteractiveMode,
        };

        // Auto-approve path skips confirmation
        context.state = context.autoApprove
          ? CommandState.EXECUTING
          : CommandState.CONFIRMING;
      } else {
        // Even without alternative command, allow user to modify unless autoApprove
        console.log(
          chalk.gray(
            "\nNo alternative command suggested. You can modify the request or abort.",
          ),
        );

        if (context.autoApprove) {
          context.abortedReason = context.abortedReason || "no-alternative";
          context.state = CommandState.ABORTED;
          return;
        }

        // Prompt for user action
        const userAction = await this.promptUser("Try a different approach?");

        if (userAction.type === UserAction.MODIFY && userAction.input) {
          console.log(chalk.gray(`Refining based on: "${userAction.input}"`));
          context.query = userAction.input;
          context.state = CommandState.ANALYZING;
        } else {
          context.abortedReason = context.abortedReason || "user-aborted";
          context.state = CommandState.ABORTED;
        }
      }
    } catch (error) {
      console.log(chalk.gray("(Unable to analyze failure)"));
      if (error instanceof Error) {
        console.error(chalk.red(`Analysis error: ${error.message}`));
      }
      context.abortedReason = context.abortedReason || "failure-analysis-error";
      context.state = CommandState.ABORTED;
    }
  }

  /**
   * Analyze command with proper conversation context
   */
  private async analyzeCommand(
    query: string,
    conversationHistory: ModelMessage[],
  ): Promise<CommandAnalysis> {
    const normalized = query.toLowerCase();
    const systemPrompt =
      "You are a shell command expert. You MUST respond with valid JSON only, no other text or formatting.";

    const userContent =
      conversationHistory.length > 0
        ? `Based on our conversation, analyze this request and generate an appropriate shell command: "${query}"

Return a JSON object with these exact fields:
{
  "command": "the shell command to execute",
  "explanation": "brief explanation of what the command does",
  "isDangerous": false,
  "requiresExternalPackages": false,
  "externalPackages": [],
  "needsInteractiveMode": false
}

Set isDangerous to true ONLY for commands that could cause irreversible system damage or data loss (like rm -rf /, format, dd, etc.).
Common development operations like removing lock files, node_modules, build artifacts, or temporary files are NOT dangerous.
Set requiresExternalPackages to true and list packages if external tools are needed.
Set needsInteractiveMode to true if the user's intent is clearly to open/run an interactive program (like "open vim", "start nano", "run python interactively", "launch htop", etc.) or if the program they're trying to run is interactive in your knowledge. If unsure, assume false.

For file searches, prefer searching in user directories (~) rather than system-wide (/) to avoid permission issues and long execution times.

JSON only:`
        : `Analyze this user query and generate an appropriate shell command: "${query}"

Return a JSON object with these exact fields:
{
  "command": "the shell command to execute",
  "explanation": "brief explanation of what the command does",
  "isDangerous": false,
  "requiresExternalPackages": false,
  "externalPackages": [],
  "needsInteractiveMode": false
}

Set isDangerous to true ONLY for commands that could cause irreversible system damage or data loss.
Common development operations are NOT dangerous.
Set needsInteractiveMode to true if the user's intent is clearly to open/run an interactive program (like "open vim", "start nano", "run python interactively", "launch htop", etc.).

For file searches, prefer searching in user directories (~) rather than system-wide (/).

JSON only:`;

    const environmentInfo = `Environment Context:\nOS: ${os.type()} ${os.release()} (${os.platform()} ${os.arch()})\nDate: ${new Date().toISOString().split('T')[0]}\nCWD: ${process.cwd()}\n\nInstructions:\n- Only propose commands valid for this OS.\n- Avoid Linux-specific /proc paths on macOS (darwin).\n- Prefer portable POSIX utilities when possible.\n- If the user's request is impossible without additional tools or privileges, still produce a safe explanatory command (e.g., an echo) and keep isDangerous=false.`;

    const messages: ModelMessage[] = [
      ...conversationHistory,
      { role: "user", content: environmentInfo + "\n\n" + userContent },
    ];

    // Suppress spinner in jsonMode for clean automation output
    const analysisPromise = generateStructured(this.model, {
      schema: CommandAnalysisSchema,
      system: systemPrompt,
      messages,
    });
    const result = this.jsonMode
      ? await analysisPromise
      : await loading.withLoading(analysisPromise, "Writing command");

    if (!result.data) {
      throw new Error("Failed to analyze command");
    }

    return result.data;
  }

  /**
   * Analyze command failure
   */
  private async analyzeFailure(
    error: CommandContext["lastError"],
    query: string,
    conversationHistory: ModelMessage[],
  ): Promise<FailureAnalysis> {
    if (!error) throw new Error("No error to analyze");

    const systemPrompt =
      "You are a shell command expert. You MUST respond with valid JSON only, no other text or formatting.";

    const userPrompt = `A command failed with the following details:

Command: ${error.command}
Exit Code: ${error.exitCode}
Standard Output: ${error.stdout || "(none)"}
Standard Error: ${error.stderr || "(none)"}
Original User Query: "${query}"

Based on our conversation history (if any) and these details, analyze the failure.

Return a JSON object with these exact fields:
{
  "explanation": "brief explanation of why the command failed (1-2 sentences max)",
  "solution": "how to fix the issue or what the user should do (1-2 sentences max)",
  "alternativeCommand": "alternative command to try (or null ONLY if absolutely no alternative exists)",
  "needsInteractiveMode": false
}

IMPORTANT: You should ALMOST ALWAYS provide an alternativeCommand that attempts to fulfill the user's original request. Look at the error message and suggest a command that will work. For example:
- If a flag isn't recognized, suggest the command without that flag or with an equivalent
- If permission denied, suggest with sudo or in a different directory
- If a tool doesn't exist, suggest an alternative tool that achieves the same goal
- If a file/directory doesn't exist, suggest creating it or using a different path

Only return null for alternativeCommand in cases where:
- The user needs to install software first (but even then, try to suggest the install command)
- The request is physically impossible (e.g., accessing hardware that doesn't exist)
- The command requires user-specific information you don't have

IMPORTANT: Set needsInteractiveMode to true ONLY if ALL of these conditions are met:
1. The failure was clearly caused by missing TTY/terminal (errors like "not a terminal", "no tty", input/output redirection issues)
2. The alternative command you're suggesting is an interactive program (vim, nano, htop, etc.)
3. Double-check: Does this alternative command actually need TTY to function properly?

If you're unsure about ANY of these conditions, set needsInteractiveMode to false. Be extremely conservative.

Be very concise and helpful. Keep explanations short. JSON only:`;

    const failureEnvInfo = `Environment Context:\nOS: ${os.type()} ${os.release()} (${os.platform()} ${os.arch()})\nDate: ${new Date().toISOString().split('T')[0]}\nCWD: ${process.cwd()}\n\nValidation Rules:\n- Suggest only commands valid for this OS.\n- Avoid Linux-specific /proc paths on macOS.\n- If hardware metrics or privileged data are requested and unavailable without new tools, return alternativeCommand null with a concise explanation unless a standard built-in utility suffices.\n- Prefer safe existence checks (test -f, test -d) before operations.\n- Never hallucinate files or system paths.`;

    const messages: ModelMessage[] = [
      ...conversationHistory,
      { role: "user", content: failureEnvInfo + "\n\n" + userPrompt },
    ];

    // Suppress spinner in jsonMode
    const failurePromise = generateStructured(this.model, {
      schema: FailureAnalysisSchema,
      system: systemPrompt,
      messages,
    });
    const result = this.jsonMode
      ? await failurePromise
      : await loading.withLoading(failurePromise, "Analyzing failure");

    if (!result.data) {
      // Fallback to plain text analysis
      const fallbackMessages: ModelMessage[] = [
        ...conversationHistory,
        {
          role: "user",
          content: `${failureEnvInfo}\n\nA command failed: ${error.command}\nExit Code: ${error.exitCode}\nError: ${error.stderr}\nOriginal user query: "${query}"\n\nBriefly explain why it failed and how to fix it (1-2 sentences max).`,
        },
      ];

      const plainText = await generateAIText(this.model, {
        system:
          "You are a shell command expert. Analyze command failures and provide helpful explanations and solutions.",
        messages: fallbackMessages,
      });

      return {
        explanation: plainText,
        solution: "See explanation above",
        alternativeCommand: null,
        needsInteractiveMode: false,
      };
    }

    return result.data;
  }

  /**
   * Authenticate sudo using sudo -v
   */
  private authenticateSudo(sudoPassword: string): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }> {
    return new Promise((resolve) => {
      const child = spawn("sudo", ["-S", "-v"], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stderr = "";
      let resolved = false;

      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      // Send password
      if (child.stdin) {
        child.stdin.write(sudoPassword + "\n");
        child.stdin.end();
      }

      child.on("close", (code) => {
        if (!resolved) {
          resolved = true;
          resolve({
            exitCode: code || 0,
            stdout: "",
            stderr: stderr,
          });
        }
      });

      child.on("error", (error) => {
        if (!resolved) {
          resolved = true;
          resolve({
            exitCode: 1,
            stdout: "",
            stderr: error.message,
          });
        }
      });
    });
  }

  /**
   * Execute shell command
   */
  private async executeCommand(
    command: string,
    needsInteractiveMode: boolean = false,
    isSudoRetry: boolean = false,
  ): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }> {
    // Check if command contains sudo
    const hasSudo = /\bsudo\b/.test(command);
    let sudoPassword: string | undefined;

    if (hasSudo && !needsInteractiveMode) {
      // Prompt for password before executing
      const promptMessage = isSudoRetry
        ? "Enter sudo password (retry):"
        : "Enter sudo password:";

      sudoPassword = await password({
        message: promptMessage,
        mask: "*",
      });

      // For piped commands, authenticate sudo first using sudo -v
      if (command.includes("|")) {
        // Run sudo -v to cache credentials
        const authResult = await this.authenticateSudo(sudoPassword);
        if (authResult.exitCode !== 0) {
          return authResult;
        }
        // Don't modify the command - sudo will use cached credentials
      } else {
        // For non-piped commands, use sudo -S
        command = command.replace(/\bsudo\b/g, "sudo -S");
      }
    }

    return new Promise((resolve) => {
      const wrappedCommand = `set -o pipefail; ${command}`;
      const useInteractive = this.forceTTY || needsInteractiveMode;

      // Only use piped stdin if we need to send a password
      const needsPipedStdin = sudoPassword && !command.includes("|");

      const child = spawn("sh", ["-c", wrappedCommand], {
        stdio: useInteractive
          ? "inherit"
          : needsPipedStdin
            ? ["pipe", "pipe", "pipe"]
            : ["inherit", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let resolved = false;
      let passwordSent = false;
      let firstOutputReceived = false;

      // Set up timeout
      let timeout: NodeJS.Timeout | undefined;
      if (this.timeoutMs) {
        timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            child.kill("SIGTERM");
            resolve({
              exitCode: 124, // Standard timeout exit code
              stdout,
              stderr:
                stderr +
                `\nCommand timed out after ${this.timeoutMs! / 1000} seconds`,
            });
          }
        }, this.timeoutMs);
      }

      if (!useInteractive) {
        child.stdout?.on("data", (data) => {
          const output = data.toString();

          // For sudo commands, add newline before first real output
          if (sudoPassword && !firstOutputReceived && output.trim()) {
            firstOutputReceived = true;
            process.stdout.write("\n");
          }

          // Filter out password prompts from sudo
          const passwordPromptRegex =
            /^(Password|Mot de passe|Contraseña|Passwort|パスワード|密码|Пароль):\s*$/m;
          const filteredOutput = output.replace(passwordPromptRegex, "");
          if (filteredOutput.trim()) {
            process.stdout.write(filteredOutput);
          }
          stdout += output;
        });

        child.stderr?.on("data", (data) => {
          const output = data.toString();

          // Check if this is a sudo password prompt
            const isSudoPrompt =
            output.includes("[sudo]") ||
            output.match(
              /^(Password|Mot de passe|Contraseña|Passwort|パスワード|密码|Пароль):\s*$/m,
            );

          // Filter out password-related prompts
          if (!isSudoPrompt) {
            // For sudo commands, add newline before first real error output
            if (sudoPassword && !firstOutputReceived && output.trim()) {
              firstOutputReceived = true;
              process.stderr.write("\n");
            }
            process.stderr.write(output);
          }

          // If we see a password prompt and haven't sent password yet, send it
          if (
            sudoPassword &&
            !passwordSent &&
            isSudoPrompt &&
            !command.includes("|")
          ) {
            passwordSent = true;
            if (child.stdin) {
              // Small delay to ensure sudo is ready
              setTimeout(() => {
                child.stdin!.write(sudoPassword + "\n");
                child.stdin!.end();
              }, 50);
            }
          }

          stderr += output;
        });
      }

      child.on("close", (code) => {
        if (!resolved) {
          resolved = true;
          if (timeout) clearTimeout(timeout);
          resolve({
            exitCode: code || 0,
            stdout: useInteractive ? "Interactive command completed" : stdout,
            stderr: useInteractive ? "" : stderr,
          });
        }
      });

      child.on("error", (error) => {
        if (!resolved) {
          resolved = true;
          if (timeout) clearTimeout(timeout);
          resolve({
            exitCode: 1,
            stdout,
            stderr: error.message,
          });
        }
      });

      // Handle Ctrl+C gracefully
      process.on("SIGINT", () => {
        if (!resolved) {
          resolved = true;
          if (timeout) clearTimeout(timeout);
          child.kill("SIGTERM");
          console.log(chalk.yellow("\nCommand interrupted"));
          resolve({
            exitCode: 130, // Standard SIGINT exit code
            stdout,
            stderr: stderr + "\nCommand interrupted by user",
          });
        }
      });
    });
  }

  /**
   * Prompt user for action
   */
  private async promptUser(
    command: string,
  ): Promise<{ type: UserAction; input?: string }> {
    const response = await input({
      message: `${command} [y/N/modify]`,
    });

    const trimmed = response.trim().toLowerCase();

    if (trimmed === "y" || trimmed === "yes") {
      return { type: UserAction.APPROVE };
    }

    if (trimmed === "n" || trimmed === "no" || trimmed === "") {
      return { type: UserAction.REJECT };
    }

    // Multi-character input is treated as modification
    if (trimmed.length > 1) {
      return { type: UserAction.MODIFY, input: response.trim() };
    }

    return { type: UserAction.REJECT };
  }

  /**
   * Update conversation history with user modification
   */
  private updateConversationHistory(
    context: CommandContext,
    userInput: string,
  ): void {
    if (!context.currentAnalysis) return;

    context.conversationHistory.push(
      {
        role: "user",
        content:
          context.query === context.originalQuery
            ? `I want to: ${context.query}`
            : `Based on our previous discussion, I want to: ${context.query}`,
      },
      {
        role: "assistant",
        content: `I suggest this command: ${context.currentAnalysis.command}\n\nExplanation: ${context.currentAnalysis.explanation}`,
      },
      {
        role: "user",
        content: userInput,
      },
    );
  }

  /**
   * Add failure context to conversation history
   */
  private addFailureToHistory(
    context: CommandContext,
    failureAnalysis: FailureAnalysis,
  ): void {
    if (!context.lastError || !context.currentAnalysis) return;

    const failureMessage = failureAnalysis.alternativeCommand
      ? `The command failed with exit code ${context.lastError.exitCode}. Error: ${context.lastError.stderr}\n\nI suggest this alternative: ${failureAnalysis.alternativeCommand}\n\nExplanation: ${failureAnalysis.explanation}`
      : `The command failed with exit code ${context.lastError.exitCode}. Error: ${context.lastError.stderr}\n\nExplanation: ${failureAnalysis.explanation}\n\nSolution: ${failureAnalysis.solution}`;

    context.conversationHistory.push(
      {
        role: "user",
        content: "Execute the command",
      },
      {
        role: "assistant",
        content: failureMessage,
      },
    );
  }

  /**
   * Display command analysis
   */
  private displayCommandAnalysis(analysis: CommandAnalysis): void {
    if (!this.jsonMode) {
      console.log(chalk.cyan(analysis.command));

      if (this.verbose) {
        console.log(chalk.gray(`\n${analysis.explanation}`));

        if (
          analysis.requiresExternalPackages &&
          analysis.externalPackages?.length
        ) {
          console.log(
            chalk.yellow(
              `\nRequires external packages: ${analysis.externalPackages.join(", ")}`,
            ),
          );
        }
      }

      if (analysis.isDangerous) {
        console.log(
          chalk.red(
            "[BLOCKED] This command is potentially dangerous and cannot be executed.",
          ),
        );
      }
    }
  }

  /**
   * Display failure analysis
   */
  private displayFailureAnalysis(analysis: FailureAnalysis): void {
    if (!this.jsonMode) {
      console.log(chalk.gray(analysis.explanation));

      if (this.verbose && analysis.solution !== analysis.explanation) {
        console.log(chalk.gray(`\nSolution: ${analysis.solution}`));
      }

      if (analysis.alternativeCommand) {
        console.log(chalk.cyan(analysis.alternativeCommand));
      }
    }
  }

  /**
   * Check if error is permission-related
   */
  private isPermissionError(stderr: string): boolean {
    return (
      stderr.includes("Permission denied") ||
      stderr.includes("Operation not permitted") ||
      stderr.includes("Sorry, try again") ||
      stderr.includes("sudo: 3 incorrect password attempts") ||
      stderr.includes("authentication failure")
    );
  }
}

/**
 * Main command handler
 */
export async function handleCommandGeneration(
  model: LanguageModel,
  query: string,
  timeoutSeconds?: number,
  verbose: boolean = false,
  forceTTY: boolean = false,
  autoApprove: boolean = false,
  maxTries: number = 3,
  jsonMode: boolean = false,
): Promise<void> {
  const timeoutMs = timeoutSeconds ? timeoutSeconds * 1000 : undefined;
  const executor = new CommandExecutor(
    model,
    timeoutMs,
    verbose,
    forceTTY,
    autoApprove,
    maxTries,
    jsonMode,
  );
  await executor.execute(query);
}

/**
 * Registers the command generation feature with the CLI program
 */
export function setupCommandCommand(program: Command): void {
  program
    .command("command")
    .alias("c")
    .description("Generate and execute shell commands using AI")
    .argument(
      "<query...>",
      "natural language description of what you want to do",
    )
    .option(
      "-t, --timeout <seconds>",
      "timeout in seconds (no timeout by default)",
    )
    .option("--tty", "force interactive/TTY mode for the command")
    .option("-v, --verbose", "show detailed explanations and context")
    .option("--provider <provider>", "AI provider to use (overrides default)")
    .option(
      "--model <model>",
      "model to use (overrides provider's preferred model)",
    )
    .option("-y, --yes", "auto-approve and run commands without prompting")
    .option(
      "--max-tries <n>",
      "maximum failed attempts before aborting (default 3)",
    )
    .option("--json", "output final result summary as JSON")
    .allowUnknownOption()
    .action(async (queryParts, options) => {
      const query = queryParts.join(" ");
      const timeoutSeconds = options.timeout
        ? parseInt(options.timeout)
        : undefined;
      const verbose = options.verbose || false;
      const forceTTY = options.tty || false;
      const autoApprove = options.yes || false;
      const maxTries = options.maxTries
        ? parseInt(options.maxTries)
        : 3;
      const jsonMode = options.json || false;

      try {
        const config = loadConfig();
        const { createModelWithOverride } = await import("../config/ai");
        const model = createModelWithOverride(
          config,
          options.provider,
          options.model,
        );
        await handleCommandGeneration(
          model,
          query,
            timeoutSeconds,
          verbose,
          forceTTY,
          autoApprove,
          maxTries,
          jsonMode,
        );
      } catch (error) {
        console.log(
          chalk.red(
            `❌ Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
          ),
        );
      }
    });
}

// Export for testing
export { CommandExecutor, CommandState, UserAction };
