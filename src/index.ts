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
import { setupConfigCommand } from "./commands/configure";
import { setupUpdateCommand } from "./commands/update";
import { setupUninstallCommand } from "./commands/uninstall";
import { setupAskCommand } from "./commands/ask";
import { setupCommandCommand } from "./commands/command";

// Handle Ctrl+C gracefully
process.on("SIGINT", () => {
  console.log(chalk.yellow("\n\n👋 Goodbye!"));
  process.exit(0);
});

// Create and configure the CLI program
const program = new Command();

// @ts-ignore - AISH_VERSION is defined at build time
const VERSION = typeof AISH_VERSION !== "undefined" ? AISH_VERSION : "0.0.0";

program
  .name("aish")
  .description("AI Shell - Your AI-powered command line assistant")
  .version(VERSION);

/**
 * Setup all commands
 */
setupAskCommand(program);
setupConfigCommand(program);
setupUpdateCommand(program);
setupUninstallCommand(program);
setupCommandCommand(program);

// Parse command line arguments and execute
program.parse();
