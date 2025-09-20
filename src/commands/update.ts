/**
 * Simple Update System
 * Uses the enterprise install script for self-updates
 */

import chalk from "chalk";
import { spawn } from "child_process";
import { Command } from "commander";

/**
 * Get current version (injected at build time)
 */
function getCurrentVersion(): string {
  // @ts-ignore - AISH_VERSION is defined at build time
  return typeof AISH_VERSION !== "undefined" ? AISH_VERSION : "0.0.0";
}

/**
 * Fetch latest version from GitHub API
 */
async function getLatestVersion(): Promise<string> {
  try {
    const response = await fetch(
      "https://api.github.com/repos/abhishekbhardwaj/aish-cli/releases/latest",
      {
        headers: {
          "User-Agent": `aish/${getCurrentVersion()}`,
          Accept: "application/vnd.github.v3+json",
        },
      },
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = (await response.json()) as { tag_name: string };
    return data.tag_name.replace(/^v/, "");
  } catch (error) {
    throw new Error(
      `Failed to check for updates: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Compare version strings (semver)
 */
function isNewerVersion(current: string, latest: string): boolean {
  const currentParts = current.split(".").map(Number);
  const latestParts = latest.split(".").map(Number);

  for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
    const currentPart = currentParts[i] || 0;
    const latestPart = latestParts[i] || 0;

    if (latestPart > currentPart) return true;
    if (latestPart < currentPart) return false;
  }

  return false;
}

/**
 * Check for updates
 */
export async function checkForUpdates(): Promise<{
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
}> {
  const currentVersion = getCurrentVersion();
  const latestVersion = await getLatestVersion();

  return {
    hasUpdate: isNewerVersion(currentVersion, latestVersion),
    currentVersion,
    latestVersion,
  };
}

/**
 * Perform self-update using the install script
 */
export async function performSelfUpdate(): Promise<void> {
  console.log(chalk.blue("🔄 Updating AISH..."));
  console.log(chalk.gray("Running install script with --force flag"));

  const installScript =
    "https://raw.githubusercontent.com/abhishekbhardwaj/aish-cli/main/scripts/install.sh";
  const command = `curl -fsSL ${installScript} | bash -s -- --force`;

  return new Promise((resolve, reject) => {
    const updateProcess = spawn("bash", ["-c", command], {
      stdio: "inherit",
    });

    updateProcess.on("close", (code) => {
      if (code === 0) {
        console.log(chalk.green("✅ Update completed successfully!"));
        console.log(
          chalk.yellow(
            "Please restart your shell or run a new command to use the updated version.",
          ),
        );
        resolve();
      } else {
        reject(new Error(`Update failed with exit code ${code}`));
      }
    });

    updateProcess.on("error", (error) => {
      reject(new Error(`Update failed: ${error.message}`));
    });
  });
}

/**
 * Handle update command
 */
export function setupUpdateCommand(program: Command): void {
  program
    .command("update")
    .description("Update AISH to the latest version")
    .option("--check", "check for updates without installing")
    .action(async (options) => {
      try {
        await handleUpdateCommand(options);
      } catch (error) {
        console.log(
          `❌ Update failed: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
        );
        process.exit(1);
      }
    });
}

export async function handleUpdateCommand(options: {
  check?: boolean;
}): Promise<void> {
  try {
    if (options.check) {
      console.log(chalk.blue("🔍 Checking for updates..."));
      const updateInfo = await checkForUpdates();

      console.log(
        `Current version: ${chalk.yellow(updateInfo.currentVersion)}`,
      );
      console.log(`Latest version:  ${chalk.green(updateInfo.latestVersion)}`);

      if (updateInfo.hasUpdate) {
        console.log(chalk.green("✅ Update available!"));
        console.log(`Run: ${chalk.cyan("aish update")}`);
      } else {
        console.log(chalk.green("✅ You're running the latest version!"));
      }
      return;
    }

    // Check if update is needed
    const updateInfo = await checkForUpdates();

    if (!updateInfo.hasUpdate) {
      console.log(chalk.green("✅ You're already running the latest version!"));
      return;
    }

    console.log(
      `Updating from ${chalk.yellow(updateInfo.currentVersion)} to ${chalk.green(updateInfo.latestVersion)}`,
    );
    await performSelfUpdate();
  } catch (error) {
    throw new Error(
      `Update failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
