/**
 * Configuration Command Handler
 *
 * Handles all configuration-related commands including interactive setup,
 * provider management, and CLI-based configuration. Provides both interactive
 * prompts and command-line options for managing AI provider configurations.
 */

import chalk from "chalk";
import { select, input, confirm } from "@inquirer/prompts";
import { ExitPromptError } from "@inquirer/core";
import { Command } from "commander";
import { PROVIDERS } from "../config/providers";
import {
  loadConfig,
  saveConfig,
  addProvider,
  removeProvider,
  setDefaultProvider,
  maskApiKey,
  type ProviderConfig,
  type Config,
} from "../config/config";

/**
 * Command-line options for the configure command
 */
export interface ConfigureOptions {
  /** Provider name to configure */
  provider?: string;
  /** Model name to use */
  model?: string;
  /** API key for authentication */
  apiKey?: string;
  /** Update model for existing provider (format: provider:model) */
  updateModel?: string;
  /** Provider name to set as default */
  setDefault?: string;
  /** Provider name to remove */
  remove?: string;
  /** Whether to list all configured providers */
  list?: boolean;
}

/**
 * Main configuration command handler
 *
 * Handles both interactive and CLI-based configuration:
 * - Interactive setup for new users
 * - Command-line options for scripting
 * - Provider management (add, remove, update, set default)
 * - Configuration viewing
 *
 * @param options - Optional command-line options
 */
export function setupConfigCommand(program: Command): void {
  const configCmd = program
    .command("config")
    .description(
      "Manage AI providers (interactive menu or script-friendly flags)",
    )
    // Script-friendly root flags (non-interactive usage)
    .option("--provider <provider>", "AI provider name")
    .option("--model <model>", "Model name")
    .option("--api-key <key>", "API key")
    .option(
      "--update-model <provider:model>",
      "Update model for provider (format: provider:model)",
    )
    .option("--set-default <provider>", "Set default provider")
    .option("--remove <provider>", "Remove provider")
    .option("--list", "List configured providers")
    .action(async (options: any) => {
      await configureCommand(options);
    });

  configCmd
    .command("show")
    .description("Show current configuration")
    .action(() => {
      const config = loadConfig();

      if (config.providers.length === 0) {
        console.log(
          chalk.yellow(
            "No configuration found. Run 'aish config' to get started.",
          ),
        );
        return;
      }

      console.log(chalk.bold("Current Configuration:"));

      config.providers.forEach((provider, index) => {
        const isDefault = provider.provider === config.defaultProvider;
        const prefix = isDefault ? chalk.green("✓ [DEFAULT]") : "  ";

        console.log(`${prefix} ${chalk.bold(provider.provider)}`);
        console.log(
          `    Preferred Model: ${chalk.gray(provider.preferredModel)}`,
        );
        console.log(`    API Key: ${chalk.gray(maskApiKey(provider.apiKey))}`);

        if (index < config.providers.length - 1) {
          console.log("");
        }
      });
    });

  configCmd
    .command("add")
    .description("Add a new AI provider")
    .option("--provider <provider>", "AI provider name")
    .option("--model <model>", "Model name")
    .option("--api-key <key>", "API key")
    .action(async (options: any) => {
      await configureCommand(options);
    });

  configCmd
    .command("remove <provider>")
    .description("Remove an AI provider")
    .action(async (provider: string) => {
      await configureCommand({ remove: provider });
    });

  configCmd
    .command("default <provider>")
    .description("Set default AI provider")
    .action(async (provider: string) => {
      await configureCommand({ setDefault: provider });
    });

  configCmd
    .command("update <provider:model>")
    .description("Update model for existing provider (format: provider:model)")
    .action(async (updateModel: string) => {
      await configureCommand({ updateModel });
    });
}

export async function configureCommand(
  options?: ConfigureOptions,
): Promise<void> {
  try {
    const config = loadConfig();

    // Handle command-line options first
    if (options) {
      if (options.list) {
        showConfiguration(config);
        return;
      }

      if (options.remove) {
        await handleRemoveProvider(config, options.remove);
        return;
      }

      if (options.setDefault) {
        await handleSetDefaultProvider(config, options.setDefault);
        return;
      }

      if (options.updateModel) {
        await handleUpdateModel(config, options.updateModel);
        return;
      }

      if (options.provider || options.model || options.apiKey) {
        await handleCliConfiguration(config, options);
        return;
      }
    }

    // Interactive setup for new users
    if (config.providers.length === 0) {
      console.log("🚀 Welcome to aish - AI Shell Assistant!\n");
      console.log("Let's set up your first AI provider configuration.\n");
      await addNewProvider(config);
      return;
    }

    // Interactive menu for existing configurations
    await showInteractiveMenu(config);
  } catch (error: unknown) {
    // Handle Ctrl+C gracefully
    if (error instanceof ExitPromptError) {
      console.log(chalk.yellow("\n\n👋 Configuration cancelled."));
      process.exit(0);
    }
    // Re-throw other errors
    throw error;
  }
}

/**
 * Shows the interactive configuration menu
 *
 * @param config - Current configuration
 */
async function showInteractiveMenu(config: Config): Promise<void> {
  const action = await select({
    message: "What would you like to do?",
    choices: [
      { name: "View current configuration", value: "view" },
      { name: "Add new provider", value: "add" },
      { name: "Remove provider", value: "remove" },
      { name: "Set default provider", value: "default" },
      { name: "Update existing provider", value: "update" },
    ],
  });

  switch (action) {
    case "view":
      showConfiguration(config);
      break;
    case "add":
      await addNewProvider(config);
      break;
    case "remove":
      await removeProviderInteractive(config);
      break;
    case "default":
      await setDefaultProviderInteractive(config);
      break;
    case "update":
      await updateProviderInteractive(config);
      break;
  }
}

/**
 * Displays the current configuration in a formatted way
 *
 * @param config - Configuration to display
 */
function showConfiguration(config: Config): void {
  console.log(chalk.bold("\nCurrent Configuration:"));

  if (config.providers.length === 0) {
    console.log(chalk.yellow("No providers configured."));
    return;
  }

  config.providers.forEach((provider: ProviderConfig, index: number) => {
    const isDefault = provider.provider === config.defaultProvider;
    const prefix = isDefault ? chalk.green("✓ [DEFAULT]") : "  ";

    console.log(`${prefix} ${chalk.bold(provider.provider)}`);
    console.log(`    Preferred Model: ${chalk.gray(provider.preferredModel)}`);
    console.log(`    API Key: ${chalk.gray(maskApiKey(provider.apiKey))}`);

    if (index < config.providers.length - 1) {
      console.log("");
    }
  });
}

/**
 * Interactive flow for adding a new provider
 *
 * @param config - Configuration to modify
 */
async function addNewProvider(config: Config): Promise<void> {
  // Create provider choices with descriptions
  const providerChoices = Object.entries(PROVIDERS).map(([key, provider]) => ({
    name: `${provider.name} (${key})`,
    value: key,
    description: provider.modelsListUrl
      ? `${provider.models.length}+ models available - see ${provider.modelsListUrl}`
      : `Models: ${provider.models.slice(0, 3).join(", ")}${provider.models.length > 3 ? "..." : ""}`,
  }));

  const selectedProvider = (await select({
    message: "Which AI provider would you like to add?",
    choices: providerChoices,
  })) as keyof typeof PROVIDERS;

  const provider = PROVIDERS[selectedProvider];
  if (!provider) {
    console.error("Invalid provider selected");
    return;
  }

  // Show available models and documentation
  console.log(`\n📚 Available models for ${provider.name}:`);
  if (provider.modelsListUrl) {
    console.log(`   Sample models: ${provider.models.join(", ")}`);
    console.log(
      `   ${chalk.bold("Full models list:")} ${chalk.blue(provider.modelsListUrl)}`,
    );
  } else {
    console.log(`   ${provider.models.join(", ")}`);
  }
  console.log(
    `   ${chalk.bold("Documentation:")} ${chalk.blue(provider.docsUrl)}`,
  );

  // Get model selection
  const selectedModel = await input({
    message: "Enter the model name you want to use:",
    default: provider.models[0],
    validate: (input) => {
      if (!input.trim()) {
        return "Model name is required";
      }
      return true;
    },
  });

  // Get API key
  console.log(`\n🔑 You'll need an API key for ${provider.name}.`);
  console.log(
    `   ${chalk.bold("Get your API key:")} ${chalk.blue(provider.docsUrl)}`,
  );

  const apiKey = await input({
    message: "Enter your API key:",
    validate: (input) => {
      if (!input.trim()) {
        return "API key is required";
      }
      if (input.length < 10) {
        return "API key seems too short. Please check and try again.";
      }
      return true;
    },
  });

  // Create and save provider configuration
  const providerConfig: ProviderConfig = {
    provider: selectedProvider,
    preferredModel: selectedModel.trim(),
    apiKey: apiKey.trim(),
  };

  addProvider(config, providerConfig);
  saveConfig(config);

  // Show success message
  console.log(chalk.green("\n✅ Provider added successfully!"));
  console.log(`   ${chalk.bold("Provider:")} ${chalk.gray(provider.name)}`);
  console.log(`   ${chalk.bold("Model:")} ${chalk.gray(selectedModel)}`);
  console.log(`   ${chalk.bold("API Key:")} ${chalk.gray(maskApiKey(apiKey))}`);

  // Show usage hint for first provider
  if (config.providers.length === 1) {
    console.log(chalk.bold("\n🎉 You're all set! Try asking a question:"));
    console.log(
      `   ${chalk.gray(`aish ask "What is the capital of France?"`)}`,
    );
  }
}

/**
 * Interactive flow for removing a provider
 *
 * @param config - Configuration to modify
 */
async function removeProviderInteractive(config: Config): Promise<void> {
  if (config.providers.length === 0) {
    console.log(chalk.yellow("No providers to remove."));
    return;
  }

  const choices = config.providers.map((p: ProviderConfig) => ({
    name: `${p.provider} (${p.preferredModel})`,
    value: p.provider,
  }));

  const providerToRemove = await select({
    message: "Which provider would you like to remove?",
    choices,
  });

  // Confirmation step
  await input({
    message: `Type "${providerToRemove}" to confirm removal:`,
    validate: (input) =>
      input === providerToRemove
        ? true
        : "Please type the exact provider name to confirm",
  });

  removeProvider(config, providerToRemove);
  saveConfig(config);

  console.log(
    chalk.green(`✅ Provider "${providerToRemove}" removed successfully!`),
  );
}

/**
 * Interactive flow for setting default provider
 *
 * @param config - Configuration to modify
 */
async function setDefaultProviderInteractive(config: Config): Promise<void> {
  if (config.providers.length <= 1) {
    console.log(
      chalk.yellow("You need at least 2 providers to set a default."),
    );
    return;
  }

  const choices = config.providers.map((p: ProviderConfig) => ({
    name: `${p.provider} (${p.preferredModel})${p.provider === config.defaultProvider ? " [CURRENT DEFAULT]" : ""}`,
    value: p.provider,
  }));

  const newDefault = await select({
    message: "Which provider should be the default?",
    choices,
  });

  setDefaultProvider(config, newDefault);
  saveConfig(config);

  console.log(chalk.green(`✅ Default provider set to "${newDefault}"!`));
}

/**
 * Interactive flow for updating an existing provider
 *
 * @param config - Configuration to modify
 */
async function updateProviderInteractive(config: Config): Promise<void> {
  if (config.providers.length === 0) {
    console.log(chalk.yellow("No providers to update."));
    return;
  }

  const choices = config.providers.map((p: ProviderConfig) => ({
    name: `${p.provider} (${p.preferredModel})`,
    value: p.provider,
  }));

  const providerToUpdate = await select({
    message: "Which provider would you like to update?",
    choices,
  });

  const existingProvider = config.providers.find(
    (p: ProviderConfig) => p.provider === providerToUpdate,
  );
  if (!existingProvider) return;

  const providerKey = providerToUpdate as keyof typeof PROVIDERS;
  const provider = PROVIDERS[providerKey];
  if (!provider) {
    console.error("Invalid provider selected");
    return;
  }

  // Show available models
  console.log(`\n📚 Available models for ${provider.name}:`);
  if (provider.modelsListUrl) {
    console.log(`   Sample models: ${provider.models.join(", ")}`);
    console.log(
      `   ${chalk.bold("Full models list:")} ${chalk.blue(provider.modelsListUrl)}`,
    );
  } else {
    console.log(`   ${provider.models.join(", ")}`);
  }
  console.log(
    `   ${chalk.bold("Documentation:")} ${chalk.blue(provider.docsUrl)}`,
  );

  // Update model
  const selectedModel = await input({
    message: "Enter the model name:",
    default: existingProvider.preferredModel,
    validate: (input) => {
      if (!input.trim()) {
        return "Model name is required";
      }
      return true;
    },
  });

  // Optionally update API key
  const updateApiKey = await confirm({
    message: "Do you want to update the API key?",
    default: false,
  });

  let apiKey = existingProvider.apiKey;
  if (updateApiKey) {
    apiKey = await input({
      message: "Enter your new API key:",
      validate: (input) => {
        if (!input.trim()) {
          return "API key is required";
        }
        if (input.length < 10) {
          return "API key seems too short. Please check and try again.";
        }
        return true;
      },
    });
  }

  // Save updated configuration
  const updatedProvider: ProviderConfig = {
    provider: providerToUpdate,
    preferredModel: selectedModel.trim(),
    apiKey: apiKey?.trim() || existingProvider.apiKey,
  };

  addProvider(config, updatedProvider);
  saveConfig(config);

  console.log(chalk.green("\n✅ Provider updated successfully!"));
  console.log(`   ${chalk.bold("Provider:")} ${chalk.gray(provider.name)}`);
  console.log(`   ${chalk.bold("Model:")} ${chalk.gray(selectedModel)}`);
  if (updateApiKey) {
    console.log(
      `   ${chalk.bold("API Key:")} ${chalk.gray(maskApiKey(apiKey))}`,
    );
  }
}

/**
 * Handles CLI-based configuration (non-interactive)
 *
 * @param config - Configuration to modify
 * @param options - Command-line options
 */
async function handleCliConfiguration(
  config: Config,
  options: ConfigureOptions,
): Promise<void> {
  if (!options.provider) {
    console.log(
      chalk.red("❌ --provider is required when using CLI configuration"),
    );
    return;
  }

  const providerKey = options.provider as keyof typeof PROVIDERS;
  if (!PROVIDERS[providerKey]) {
    console.log(
      chalk.red(
        `❌ Invalid provider "${options.provider}". Available providers: ${Object.keys(PROVIDERS).join(", ")}`,
      ),
    );
    return;
  }

  const existingProvider = config.providers.find(
    (p) => p.provider === options.provider,
  );

  // Validate required fields for new providers
  if (!options.model && !existingProvider) {
    console.log(chalk.red("❌ --model is required when adding a new provider"));
    return;
  }

  // Validate required authentication field for new providers
  if (!existingProvider && !options.apiKey) {
    console.log(
      chalk.red("❌ --api-key is required when adding a new provider"),
    );
    return;
  }

  // Create provider configuration
  const providerConfig: ProviderConfig = {
    provider: options.provider,
    preferredModel: options.model || existingProvider?.preferredModel || "",
    apiKey: options.apiKey || existingProvider?.apiKey || "",
  };

  // Final validation
  if (!providerConfig.preferredModel) {
    console.log(chalk.red("❌ Model is required"));
    return;
  }

  if (!providerConfig.apiKey) {
    console.log(chalk.red("❌ API key is required"));
    return;
  }

  // Save configuration
  addProvider(config, providerConfig);
  saveConfig(config);

  const provider = PROVIDERS[providerKey];
  const action = existingProvider ? "updated" : "added";

  console.log(chalk.green(`\n✅ Provider ${action} successfully!`));
  console.log(`   ${chalk.bold("Provider:")} ${chalk.gray(provider.name)}`);
  console.log(
    `   ${chalk.bold("Preferred Model:")} ${chalk.gray(providerConfig.preferredModel)}`,
  );
  console.log(
    `   ${chalk.bold("API Key:")} ${chalk.gray(maskApiKey(providerConfig.apiKey))}`,
  );
}

/**
 * Handles provider removal via CLI
 *
 * @param config - Configuration to modify
 * @param providerToRemove - Name of provider to remove
 */
async function handleRemoveProvider(
  config: Config,
  providerToRemove: string,
): Promise<void> {
  const existingProvider = config.providers.find(
    (p) => p.provider === providerToRemove,
  );
  if (!existingProvider) {
    console.log(chalk.red(`❌ Provider "${providerToRemove}" not found.`));
    return;
  }

  removeProvider(config, providerToRemove);
  saveConfig(config);
  console.log(
    chalk.green(`✅ Provider "${providerToRemove}" removed successfully!`),
  );
}

/**
 * Handles setting default provider via CLI
 *
 * @param config - Configuration to modify
 * @param providerName - Name of provider to set as default
 */
async function handleSetDefaultProvider(
  config: Config,
  providerName: string,
): Promise<void> {
  const existingProvider = config.providers.find(
    (p) => p.provider === providerName,
  );
  if (!existingProvider) {
    console.log(
      chalk.red(`❌ Provider "${providerName}" not found. Add it first.`),
    );
    return;
  }

  setDefaultProvider(config, providerName);
  saveConfig(config);
  console.log(chalk.green(`✅ Default provider set to "${providerName}"!`));
}

/**
 * Handles updating model for existing provider via CLI
 *
 * @param config - Configuration to modify
 * @param updateModelArg - Provider:model string (e.g., "openai:gpt-4o")
 */
async function handleUpdateModel(
  config: Config,
  updateModelArg: string,
): Promise<void> {
  const parts = updateModelArg.split(":");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    console.log(
      chalk.red("❌ Invalid format. Use: provider:model (e.g., openai:gpt-4o)"),
    );
    return;
  }

  const [providerName, newModel] = parts;

  const existingProvider = config.providers.find(
    (p) => p.provider === providerName,
  );
  if (!existingProvider) {
    console.log(
      chalk.red(`❌ Provider "${providerName}" not found. Add it first.`),
    );
    return;
  }

  const providerKey = providerName as keyof typeof PROVIDERS;
  if (!PROVIDERS[providerKey]) {
    console.log(chalk.red(`❌ Invalid provider "${providerName}".`));
    return;
  }

  // Update the model while keeping existing API key
  const updatedProvider: ProviderConfig = {
    provider: providerName,
    preferredModel: newModel.trim(),
    apiKey: existingProvider.apiKey,
  };

  addProvider(config, updatedProvider);
  saveConfig(config);

  const provider = PROVIDERS[providerKey];
  console.log(chalk.green(`\n✅ Model updated successfully!`));
  console.log(`   ${chalk.bold("Provider:")} ${chalk.gray(provider.name)}`);
  console.log(
    `   ${chalk.bold("Preferred Model:")} ${chalk.gray(existingProvider.preferredModel)} → ${chalk.gray(newModel)}`,
  );
}
