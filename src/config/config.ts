/**
 * Configuration Management
 * 
 * Handles loading, saving, and manipulating configuration data for AI providers.
 * Manages the ~/.config/aish/auth.json file and provides utilities for
 * provider management, API key masking, and legacy config migration.
 */

import { join } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";

/**
 * Configuration for a single AI provider
 */
export interface ProviderConfig {
  /** Provider identifier (e.g., 'anthropic', 'openai') */
  provider: string;
  /** Preferred model name to use with this provider */
  preferredModel: string;
  /** API key for authentication */
  apiKey: string;
}

/**
 * Main configuration structure containing all providers and settings
 */
export interface Config {
  /** Array of configured AI providers */
  providers: ProviderConfig[];
  /** Name of the default provider to use */
  defaultProvider?: string;
}

/** Directory path for storing configuration files */
const CONFIG_DIR = join(homedir(), ".config", "aish");

/** Full path to the configuration file */
const CONFIG_FILE = join(CONFIG_DIR, "auth.json");

/**
 * Ensures the configuration directory exists
 * Creates the directory structure if it doesn't exist
 */
export function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Loads configuration from the auth.json file
 * 
 * Handles:
 * - Missing configuration files (returns empty config)
 * - Legacy configuration format migration
 * - JSON parsing errors
 * 
 * @returns Configuration object with providers and default settings
 */
export function loadConfig(): Config {
  ensureConfigDir();
  
  // Return empty config if file doesn't exist
  if (!existsSync(CONFIG_FILE)) {
    return { providers: [] };
  }
  
  try {
    const content = readFileSync(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(content);
    
    // Handle legacy config format (single provider at root level)
    if (parsed.provider && parsed.model && parsed.apiKey) {
      return {
        providers: [{
          provider: parsed.provider,
          preferredModel: parsed.model,
          apiKey: parsed.apiKey
        }],
        defaultProvider: parsed.provider
      };
    }
    
    // Return parsed config or empty config if malformed
    return parsed.providers ? parsed : { providers: [] };
  } catch (error) {
    console.error("Error reading config file:", error);
    return { providers: [] };
  }
}

/**
 * Saves configuration to the auth.json file
 * 
 * @param config - Configuration object to save
 * @throws Error if file writing fails
 */
export function saveConfig(config: Config): void {
  ensureConfigDir();
  
  try {
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error("Error saving config file:", error);
    throw error;
  }
}

/**
 * Masks an API key for secure display
 * Shows first 4 and last 4 characters, masks the middle
 * 
 * @param apiKey - The API key to mask
 * @returns Masked API key string (e.g., "sk-1***abc2")
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length < 8) {
    return "****";
  }
  
  const start = apiKey.slice(0, 4);
  const end = apiKey.slice(-4);
  const middle = "*".repeat(Math.max(4, apiKey.length - 8));
  
  return `${start}${middle}${end}`;
}

/**
 * Adds or updates a provider in the configuration
 * 
 * If a provider with the same name exists, it will be updated.
 * If no default provider is set, the new provider becomes default.
 * 
 * @param config - Configuration object to modify
 * @param providerConfig - Provider configuration to add/update
 * @returns Modified configuration object
 */
export function addProvider(config: Config, providerConfig: ProviderConfig): Config {
  const existingIndex = config.providers.findIndex(p => p.provider === providerConfig.provider);
  
  if (existingIndex >= 0) {
    // Update existing provider
    config.providers[existingIndex] = providerConfig;
  } else {
    // Add new provider
    config.providers.push(providerConfig);
  }
  
  // Set as default if no default exists
  if (!config.defaultProvider) {
    config.defaultProvider = providerConfig.provider;
  }
  
  return config;
}

/**
 * Removes a provider from the configuration
 * 
 * If the removed provider was the default, sets the first remaining
 * provider as the new default (or undefined if no providers remain).
 * 
 * @param config - Configuration object to modify
 * @param providerName - Name of the provider to remove
 * @returns Modified configuration object
 */
export function removeProvider(config: Config, providerName: string): Config {
  config.providers = config.providers.filter(p => p.provider !== providerName);
  
  // Update default provider if the removed one was default
  if (config.defaultProvider === providerName) {
    config.defaultProvider = config.providers.length > 0 ? config.providers[0]?.provider : undefined;
  }
  
  return config;
}

/**
 * Sets the default provider
 * 
 * Only sets the default if the specified provider exists in the configuration.
 * 
 * @param config - Configuration object to modify
 * @param providerName - Name of the provider to set as default
 * @returns Modified configuration object
 */
export function setDefaultProvider(config: Config, providerName: string): Config {
  const provider = config.providers.find(p => p.provider === providerName);
  if (provider) {
    config.defaultProvider = providerName;
  }
  return config;
}

/**
 * Gets the default provider configuration
 * 
 * Returns the configured default provider, or the first provider
 * if no default is explicitly set.
 * 
 * @param config - Configuration object to query
 * @returns Default provider configuration, or undefined if no providers exist
 */
export function getDefaultProvider(config: Config): ProviderConfig | undefined {
  if (!config.defaultProvider) {
    return config.providers[0];
  }
  return config.providers.find(p => p.provider === config.defaultProvider);
}