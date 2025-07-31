/**
 * AI Provider Configuration
 * 
 * Defines available AI providers, their models, and documentation links.
 * This module centralizes all provider-specific information for the CLI tool.
 */

import chalk from "chalk";

/**
 * Interface defining the structure of AI provider information
 */
export interface ProviderInfo {
  /** Display name of the AI provider */
  name: string;
  /** Array of available model names for this provider */
  models: string[];
  /** URL to the provider's documentation */
  docsUrl: string;
  /** Optional URL to a complete list of available models */
  modelsListUrl?: string;
}

/**
 * Registry of all supported AI providers and their configurations
 * 
 * Each provider includes:
 * - Display name for user interfaces
 * - Sample models (most commonly used)
 * - Documentation URL for setup instructions
 * - Optional URL for complete model listings
 */
export const PROVIDERS: Record<string, ProviderInfo> = {
  /** Anthropic's Claude models */
  anthropic: {
    name: "Anthropic",
    models: [
      "claude-3-5-sonnet-20241022",    // Latest Sonnet model
      "claude-3-5-haiku-20241022",     // Latest Haiku model
      "claude-3-opus-20240229",        // Most capable model
      "claude-3-sonnet-20240229",      // Balanced model
      "claude-3-haiku-20240307"        // Fastest model
    ],
    docsUrl: "https://ai-sdk.dev/providers/ai-sdk-providers/anthropic#model-capabilities"
  },
  
  /** OpenAI's GPT models */
  openai: {
    name: "OpenAI",
    models: [
      "gpt-4o",           // Latest GPT-4 Omni model
      "gpt-4o-mini",      // Smaller, faster GPT-4 Omni
      "gpt-4-turbo",      // GPT-4 Turbo model
      "gpt-4",            // Standard GPT-4
      "gpt-3.5-turbo"     // Legacy but fast model
    ],
    docsUrl: "https://ai-sdk.dev/providers/ai-sdk-providers/openai#model-capabilities"
  },
  
  /** xAI's Grok models */
  xai: {
    name: "xAI (Grok)",
    models: [
      "grok-beta",         // Standard Grok model
      "grok-vision-beta"   // Grok with vision capabilities
    ],
    docsUrl: "https://ai-sdk.dev/providers/ai-sdk-providers/xai#model-capabilities"
  },
  
  /** OpenRouter - aggregates multiple providers */
  openrouter: {
    name: "OpenRouter",
    models: [
      "anthropic/claude-3.5-sonnet",           // Claude via OpenRouter
      "openai/gpt-4o",                         // GPT-4 via OpenRouter
      "google/gemini-pro-1.5",                 // Gemini via OpenRouter
      "meta-llama/llama-3.1-405b-instruct",   // Llama via OpenRouter
      "mistralai/mistral-large"                // Mistral via OpenRouter
    ],
    docsUrl: "https://ai-sdk.dev/providers/community-providers/openrouter#model-capabilities",
    modelsListUrl: "https://openrouter.ai/models"
  },
  
  /** Groq - fast inference platform */
  groq: {
    name: "Groq",
    models: [
      "llama-3.1-70b-versatile",  // Large Llama model
      "llama-3.1-8b-instant",     // Fast Llama model
      "mixtral-8x7b-32768",       // Mixtral model with large context
      "gemma2-9b-it"              // Google's Gemma model
    ],
    docsUrl: "https://ai-sdk.dev/providers/ai-sdk-providers/groq#model-capabilities",
    modelsListUrl: "https://console.groq.com/docs/models"
  },
  
  /** Mistral AI models */
  mistral: {
    name: "Mistral",
    models: [
      "mistral-large-latest",   // Largest Mistral model
      "mistral-medium-latest",  // Medium-sized model
      "mistral-small-latest",   // Smallest model
      "codestral-latest"        // Code-specialized model
    ],
    docsUrl: "https://ai-sdk.dev/providers/ai-sdk-providers/mistral#model-capabilities"
  },
  
  /** Google's Gemini models */
  google: {
    name: "Google (Gemini)",
    models: [
      "gemini-1.5-pro",    // Most capable Gemini model
      "gemini-1.5-flash",  // Fast Gemini model
      "gemini-1.0-pro"     // Legacy Gemini model
    ],
    docsUrl: "https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai#model-capabilities"
  }
};

/**
 * Displays a formatted list of all available AI providers
 * 
 * Shows provider names, sample models, documentation links,
 * and example configuration commands for each provider.
 */
export function listProviders(): void {
  console.log(chalk.bold("Available AI Providers:\n"));
  
  Object.entries(PROVIDERS).forEach(([key, provider]) => {
    console.log(chalk.bold(`${provider.name} (${key}):`));
    console.log(`  ${chalk.bold("Sample Models:")} ${chalk.gray(provider.models.join(", "))}`);
    console.log(`  ${chalk.bold("Documentation:")} ${chalk.gray(provider.docsUrl)}`);
    
    // Show complete model list URL if available
    if (provider.modelsListUrl) {
      console.log(`  ${chalk.bold("All Models:")} ${chalk.gray(provider.modelsListUrl)}`);
    }
    
    // Provide example configuration command
    console.log(`  ${chalk.bold("Example:")} ${chalk.gray(`aish configure --provider ${key} --model ${provider.models[0]} --api-key YOUR_API_KEY`)}\n`);
  });
}