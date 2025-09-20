/**
 * Ask Command Module
 *
 * Extracted from the previous inline implementation in src/index.ts
 * Provides an `ask` command for posing a question to the configured AI provider.
 */

import { Command } from "commander";
import chalk from "chalk";
import { loading } from "../components/ui/loading";
import { loadConfig } from "../config/config";
import {
  createModelWithOverride,
  generateAIText,
  streamAIText,
} from "../config/ai";

/**
 * Registers the ask command with the provided program.
 */
export function setupAskCommand(program: Command): void {
  program
    .command("ask")
    .alias("a")
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
}
