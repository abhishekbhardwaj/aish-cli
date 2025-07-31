#!/usr/bin/env bun

/**
 * AISH - AI Shell Assistant
 *
 * Main entry point for the AI-powered command line assistant.
 * Provides commands for asking questions, configuring AI providers,
 * and managing application settings.
 */

import { Command } from "commander";
import chalk from "chalk";
import { loading } from "./components/ui/loading";
import {
  loadConfig,
  maskApiKey,
  getDefaultProvider,
  type ProviderConfig,
} from "./config/config";
import { configureCommand } from "./commands/configure";
import { createModel, generateAIText, streamAIText } from "./config/ai";
import { handleCommandGeneration } from "./commands/command";

/**
 * Validates that a provider exists in the configuration
 */
function validateProvider(
  config: ReturnType<typeof loadConfig>,
  provider: string,
): ProviderConfig {
  const providerConfig = config.providers.find((p) => p.provider === provider);
  if (!providerConfig) {
    const availableProviders = config.providers
      .map((p) => p.provider)
      .join(", ");
    throw new Error(
      `Provider '${provider}' not found in configuration. Available providers: ${availableProviders || "none"}`,
    );
  }
  return providerConfig;
}

/**
 * Creates a model with optional provider/model override
 */
function createModelWithOverride(
  config: ReturnType<typeof loadConfig>,
  providerOverride?: string,
  modelOverride?: string,
): ReturnType<typeof createModel> {
  let providerConfig: ProviderConfig;

  if (providerOverride) {
    providerConfig = validateProvider(config, providerOverride);
    // If model override is provided, use it; otherwise use the provider's preferred model
    if (modelOverride) {
      providerConfig = { ...providerConfig, preferredModel: modelOverride };
    }
  } else {
    const defaultProvider = getDefaultProvider(config);
    if (!defaultProvider) {
      throw new Error(
        "No AI provider configured. Run 'aish configure' to get started.",
      );
    }
    providerConfig = defaultProvider;
    // If only model override is provided, use it with the default provider
    if (modelOverride) {
      providerConfig = { ...providerConfig, preferredModel: modelOverride };
    }
  }

  return createModel(providerConfig);
}

/**
 * Handle Ctrl+C gracefully across the application
 * Ensures clean exit with a friendly goodbye message
 */
process.on("SIGINT", () => {
  console.log(chalk.yellow("\n\n👋 Goodbye!"));
  process.exit(0);
});

/**
 * Initialize the Commander.js program with basic metadata
 */
const program = new Command();

// @ts-ignore - AISH_VERSION is defined at build time
const VERSION = typeof AISH_VERSION !== "undefined" ? AISH_VERSION : "0.0.0";

program
  .name("aish")
  .description("AI Shell - Your AI-powered command line assistant")
  .version(VERSION);

/**
 * ASK COMMAND
 * Main command for asking questions to the AI
 * Uses the reusable AI service for consistent behavior
 */
program
  .command("ask")
  .description("Ask AI a question")
  .argument("<question...>", "question to ask")
  .option("--completion", "wait for complete response instead of streaming")
  .option("--provider <provider>", "AI provider to use (overrides default)")
  .option(
    "--model <model>",
    "model to use (overrides provider's preferred model)",
  )
  .allowUnknownOption()
  .action(async (questionParts, options) => {
    const question = questionParts.join(" ");
    try {
      const config = loadConfig();
      const model = createModelWithOverride(
        config,
        options.provider,
        options.model,
      );

      if (options.completion) {
        const response = await loading.withLoading(
          generateAIText(model, {
            prompt: question,
            system:
              "You are a helpful AI assistant. Provide clear, concise, and accurate responses.",
          }),
          "Thinking",
        );
        console.log(response);
      } else {
        loading.start("Thinking");
        let spinnerStopped = false;
        const stopSpinner = () => {
          if (!spinnerStopped) {
            loading.stop();
            spinnerStopped = true;
          }
        };

        await streamAIText(
          model,
          {
            prompt: question,
            system:
              "You are a helpful AI assistant. Provide clear, concise, and accurate responses.",
          },
          () => {
            stopSpinner();
            // The error will be thrown by the onError callback in streamAIText
          },
        );
      }
    } catch (error) {
      console.log(
        chalk.red(
          `❌ Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
        ),
      );
    }
  });

/**
 * INIT COMMAND
 * Alias for interactive configuration setup
 * Provides a user-friendly entry point for first-time setup
 */
program
  .command("init")
  .description("Interactive setup for AI provider configuration")
  .action(async () => {
    await configureCommand();
  });

/**
 * CONFIGURE COMMAND
 * Comprehensive configuration management with both CLI and interactive options
 * Supports adding, removing, updating, and managing AI providers
 */
program
  .command("configure")
  .description("Configure AI provider, model, and API key")
  .option(
    "--provider <provider>",
    "AI provider (anthropic, openai, xai, openrouter, groq, mistral, google)",
  )
  .option("--model <model>", "Model name")
  .option("--api-key <key>", "API key")
  .option(
    "--update-model <provider:model>",
    "Update model for existing provider (format: provider:model)",
  )
  .option("--set-default <provider>", "Set default provider")
  .option("--remove <provider>", "Remove provider")
  .option("--list", "List all configured providers")
  .action(async (options) => {
    await configureCommand(options);
  });

/**
 * CONFIGURATION COMMAND
 * Quick view of current configuration without modification options
 * Shows all configured providers with their models and masked API keys
 */
program
  .command("configuration")
  .description("Show current configuration")
  .action(() => {
    const config = loadConfig();

    // Handle empty configuration
    if (config.providers.length === 0) {
      console.log(
        chalk.yellow(
          "No configuration found. Run 'aish configure' to get started.",
        ),
      );
      return;
    }

    // Display formatted configuration
    console.log(chalk.bold("Current Configuration:"));

    config.providers.forEach((provider, index) => {
      const isDefault = provider.provider === config.defaultProvider;
      const prefix = isDefault ? chalk.green("✓ [DEFAULT]") : "  ";

      console.log(`${prefix} ${chalk.bold(provider.provider)}`);
      console.log(
        `    Preferred Model: ${chalk.gray(provider.preferredModel)}`,
      );
      console.log(`    API Key: ${chalk.gray(maskApiKey(provider.apiKey))}`);

      // Add spacing between providers (except for the last one)
      if (index < config.providers.length - 1) {
        console.log("");
      }
    });
  });

/**
 * COMMAND COMMAND
 * AI-powered command generation and execution
 * Uses the extracted command handler for clean separation of concerns
 */
program
  .command("command")
  .alias("c")
  .description("Generate and execute shell commands using AI")
  .argument("<query...>", "natural language description of what you want to do")
  .option(
    "-t, --timeout <seconds>",
    "timeout in seconds (no timeout by default)",
  )
  .option("-v, --verbose", "show detailed explanations and context")
  .option("--provider <provider>", "AI provider to use (overrides default)")
  .option(
    "--model <model>",
    "model to use (overrides provider's preferred model)",
  )
  .allowUnknownOption()
  .action(async (queryParts, options) => {
    const query = queryParts.join(" ");
    const timeoutSeconds = options.timeout
      ? parseInt(options.timeout)
      : undefined;
    const verbose = options.verbose || false;

    try {
      const config = loadConfig();
      const model = createModelWithOverride(
        config,
        options.provider,
        options.model,
      );
      await handleCommandGeneration(model, query, timeoutSeconds, verbose);
    } catch (error) {
      console.log(
        chalk.red(
          `❌ Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
        ),
      );
    }
  });

/**
 * UPDATE COMMAND
 * Simple self-update using the enterprise install script
 */
program
  .command("update")
  .description("Update AISH to the latest version")
  .option("--check", "check for updates without installing")
  .action(async (options) => {
    const { handleUpdateCommand } = await import("./commands/update");

    try {
      await handleUpdateCommand(options);
    } catch (error) {
      console.log(
        chalk.red(
          `❌ Update failed: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
        ),
      );
      process.exit(1);
    }
  });

/**
 * UNINSTALL COMMAND
 * Clean removal of AISH from the system
 */
program
  .command("uninstall")
  .description("Uninstall AISH from your system")
  .option("--force", "skip confirmation prompt")
  .option("--config-only", "only remove configuration files, keep binary")
  .action(async (options) => {
    const { handleUninstallCommand } = await import("./commands/uninstall");

    try {
      await handleUninstallCommand(options);
    } catch (error) {
      console.log(
        chalk.red(
          `❌ Uninstall failed: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
        ),
      );
      process.exit(1);
    }
  });

/**
 * Parse command line arguments and execute the appropriate command
 */
program.parse();
