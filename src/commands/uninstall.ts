/**
 * Uninstall Command
 * Provides a clean way to remove AISH from the system
 */

import chalk from "chalk";
import { confirm } from "@inquirer/prompts";
import { existsSync, unlinkSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { Command } from "commander";

/**
 * Get the current binary path
 */
function getCurrentBinaryPath(): string | null {
  // Try to find where the current binary is located
  const possiblePaths = [
    join(homedir(), ".local", "bin", "aish"),
    join(homedir(), ".aish", "bin", "aish"), // Legacy location
    "/usr/local/bin/aish",
    join(homedir(), "bin", "aish"),
  ];

  for (const path of possiblePaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  return null;
}

/**
 * Get configuration directory path
 */
function getConfigPath(): string {
  return join(homedir(), ".config", "aish");
}

/**
 * Get legacy config file path
 */
function getLegacyConfigPath(): string {
  return join(homedir(), ".aish.json");
}

/**
 * Check what will be removed
 */
function getRemovalItems(): {
  binary: string | null;
  config: string | null;
  legacyConfig: string | null;
} {
  const binary = getCurrentBinaryPath();
  const configDir = getConfigPath();
  const legacyConfig = getLegacyConfigPath();

  return {
    binary,
    config: existsSync(configDir) ? configDir : null,
    legacyConfig: existsSync(legacyConfig) ? legacyConfig : null,
  };
}

/**
 * Handle uninstall command
 */
export function setupUninstallCommand(program: Command): void {
  program
    .command("uninstall")
    .description("Uninstall AISH from your system")
    .option("--force", "skip confirmation prompt")
    .option("--config-only", "only remove configuration files, keep binary")
    .action(async (options) => {
      try {
        await handleUninstallCommand(options);
      } catch (error) {
        console.log(
          `❌ Uninstall failed: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
        );
        process.exit(1);
      }
    });
}

export async function handleUninstallCommand(options: {
  force?: boolean;
  configOnly?: boolean;
}): Promise<void> {
  console.log(chalk.bold("🗑️  AISH Uninstaller"));
  console.log("=".repeat(50));

  const items = getRemovalItems();

  // Show what will be removed
  console.log(chalk.blue("\n📋 Items to be removed:"));

  if (!options.configOnly && items.binary) {
    console.log(chalk.yellow(`  • Binary: ${items.binary}`));
  } else if (!options.configOnly) {
    console.log(chalk.gray("  • Binary: Not found"));
  }

  if (items.config) {
    console.log(chalk.yellow(`  • Configuration: ${items.config}`));
  } else {
    console.log(chalk.gray("  • Configuration: Not found"));
  }

  if (items.legacyConfig) {
    console.log(chalk.yellow(`  • Legacy config: ${items.legacyConfig}`));
  }

  // Check if there's nothing to remove
  const hasItemsToRemove =
    (!options.configOnly && items.binary) || items.config || items.legacyConfig;

  if (!hasItemsToRemove) {
    console.log(chalk.green("\n✅ AISH is not installed or already removed."));
    return;
  }

  // Confirm removal unless --force is used
  if (!options.force) {
    console.log(chalk.red("\n⚠️  This action cannot be undone!"));

    const shouldProceed = await confirm({
      message: "Are you sure you want to uninstall AISH?",
      default: false,
    });

    if (!shouldProceed) {
      console.log(chalk.yellow("❌ Uninstall cancelled."));
      return;
    }
  }

  console.log(chalk.blue("\n🔄 Removing AISH..."));

  let removedItems = 0;

  // Remove binary
  if (!options.configOnly && items.binary) {
    try {
      unlinkSync(items.binary);
      console.log(chalk.green(`  ✅ Removed binary: ${items.binary}`));
      removedItems++;
    } catch (error) {
      console.log(
        chalk.red(
          `  ❌ Failed to remove binary: ${error instanceof Error ? error.message : "Unknown error"}`,
        ),
      );
    }
  }

  // Remove configuration directory
  if (items.config) {
    try {
      const { rmSync } = await import("fs");
      rmSync(items.config, { recursive: true, force: true });
      console.log(chalk.green(`  ✅ Removed configuration: ${items.config}`));
      removedItems++;
    } catch (error) {
      console.log(
        chalk.red(
          `  ❌ Failed to remove configuration: ${error instanceof Error ? error.message : "Unknown error"}`,
        ),
      );
    }
  }

  // Remove legacy config file
  if (items.legacyConfig) {
    try {
      unlinkSync(items.legacyConfig);
      console.log(
        chalk.green(`  ✅ Removed legacy config: ${items.legacyConfig}`),
      );
      removedItems++;
    } catch (error) {
      console.log(
        chalk.red(
          `  ❌ Failed to remove legacy config: ${error instanceof Error ? error.message : "Unknown error"}`,
        ),
      );
    }
  }

  // Final message
  if (removedItems > 0) {
    console.log(
      chalk.green(`\n🎉 Successfully removed ${removedItems} item(s)!`),
    );

    if (!options.configOnly) {
      console.log(chalk.blue("\n📝 Manual cleanup (if needed):"));
      console.log(
        chalk.gray("  • Remove any PATH exports from your shell config files"),
      );
      console.log(
        chalk.gray(
          "  • Restart your terminal or run: source ~/.zshrc (or ~/.bashrc)",
        ),
      );
    }

    console.log(chalk.yellow("\n👋 Thanks for using AISH!"));
  } else {
    console.log(
      chalk.red("\n❌ No items were removed. Please check permissions."),
    );
  }
}
