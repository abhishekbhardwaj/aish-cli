/**
 * AI SDK Provider Configuration
 *
 * Provides factory functions for creating AI SDK providers and model mappings
 * with capabilities for all supported providers in the aish CLI tool.
 * Includes typesafe model creation and unified AI service interface.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createXai } from "@ai-sdk/xai";
import { createMistral } from "@ai-sdk/mistral";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  generateText,
  generateObject,
  streamText,
  type LanguageModel,
  type CoreMessage,
} from "ai";
import { z } from "zod";
import { LLMJSONParser } from "ai-json-fixer";
import type { ProviderConfig } from "./config";

/**
 * Factory function for creating Anthropic provider
 */
export const createAiSdkAnthropic = (apiKey: string) =>
  createAnthropic({
    apiKey,
  });

/**
 * Factory function for creating OpenAI provider
 */
export const createAiSdkOpenAI = (apiKey: string) =>
  createOpenAI({
    apiKey,
  });

/**
 * Factory function for creating xAI provider
 */
export const createAiSdkXai = (apiKey: string) =>
  createXai({
    apiKey,
  });

/**
 * Factory function for creating Mistral provider
 */
export const createAiSdkMistral = (apiKey: string) =>
  createMistral({
    apiKey,
  });

/**
 * Factory function for creating Google Generative AI provider
 */
export const createAiSdkGoogle = (apiKey: string) =>
  createGoogleGenerativeAI({
    apiKey,
  });

/**
 * Factory function for creating Groq provider
 */
export const createAiSdkGroq = (apiKey: string) =>
  createGroq({
    apiKey,
  });

/**
 * Factory function for creating OpenRouter provider
 */
export const createAiSdkOpenRouter = (apiKey: string) =>
  createOpenRouter({
    apiKey,
  });

/**
 * Supported AI providers
 */
export type SupportedProvider =
  | "anthropic"
  | "openai"
  | "xai"
  | "mistral"
  | "google"
  | "groq"
  | "openrouter";

/**
 * Provider factory map for type safety
 */
const PROVIDER_FACTORIES = {
  anthropic: createAiSdkAnthropic,
  openai: createAiSdkOpenAI,
  xai: createAiSdkXai,
  mistral: createAiSdkMistral,
  google: createAiSdkGoogle,
  groq: createAiSdkGroq,
  openrouter: createAiSdkOpenRouter,
} as const;

/**
 * AI Service error types
 */
export class AIServiceError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AIServiceError";
  }
}

/**
 * Extracts human-readable error message from AI SDK errors
 */
function extractAIError(error: unknown): string {
  // Handle wrapped error objects (from onError callback)
  if (error && typeof error === "object" && "error" in error) {
    const wrappedError = (error as any).error;
    return extractAIError(wrappedError);
  }

  // Check if it's an AI SDK error with detailed information
  if (
    error &&
    typeof error === "object" &&
    "statusCode" in error &&
    "data" in error
  ) {
    const aiError = error as any;

    // Try to get the specific error message from the response
    if (aiError.data?.error?.message) {
      return aiError.data.error.message;
    }

    // Handle common HTTP status codes
    switch (aiError.statusCode) {
      case 401:
        return "Invalid API key. Please check your API key configuration.";
      case 403:
        return "Access forbidden. Please check your API key permissions.";
      case 429:
        return "Rate limit exceeded. Please try again later.";
      case 404:
        return "Model not found. Please check the model name.";
      case 500:
        return "AI service error. Please try again later.";
      default:
        if (aiError.message) {
          return aiError.message;
        }
    }
  }

  // Fallback to the error message if available
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error occurred";
}

export class UnsupportedProviderError extends AIServiceError {
  constructor(provider: string) {
    super(`Unsupported AI provider: ${provider}`);
    this.name = "UnsupportedProviderError";
  }
}

export class ModelCreationError extends AIServiceError {
  constructor(provider: string, cause?: unknown) {
    super(`Failed to create model for provider: ${provider}`, cause);
    this.name = "ModelCreationError";
  }
}

/**
 * Options for text generation
 */
export interface GenerateTextOptions {
  system?: string;
  prompt?: string;
  messages?: CoreMessage[];
  temperature?: number;
  maxTokens?: number;
}

/**
 * Options for structured generation with JSON parsing
 */
export interface GenerateStructuredOptions<T> extends GenerateTextOptions {
  schema?: z.ZodSchema<T>;
  parseMode?: "strict" | "standard" | "aggressive";
}

/**
 * Result from structured generation
 */
export interface StructuredResult<T> {
  data: T | null;
  fixes?: number;
  warnings?: string[];
  rawText: string;
}

/**
 * Creates a typesafe model instance for the given provider config
 */
export function createModel(config: ProviderConfig): LanguageModel {
  const provider = config.provider as SupportedProvider;

  if (!isValidProvider(provider)) {
    throw new UnsupportedProviderError(provider);
  }

  try {
    switch (provider) {
      case "anthropic":
        return createAiSdkAnthropic(config.apiKey)(config.preferredModel);
      case "openai":
        return createAiSdkOpenAI(config.apiKey)(config.preferredModel);
      case "xai":
        return createAiSdkXai(config.apiKey)(config.preferredModel);
      case "mistral":
        return createAiSdkMistral(config.apiKey)(config.preferredModel);
      case "google":
        return createAiSdkGoogle(config.apiKey)(config.preferredModel);
      case "groq":
        return createAiSdkGroq(config.apiKey)(config.preferredModel);
      case "openrouter":
        return createAiSdkOpenRouter(config.apiKey)(config.preferredModel);
      default:
        throw new UnsupportedProviderError(provider);
    }
  } catch (error) {
    throw new ModelCreationError(provider, error);
  }
}

/**
 * Type guard for supported providers
 */
function isValidProvider(provider: string): provider is SupportedProvider {
  return provider in PROVIDER_FACTORIES;
}

/**
 * Generates text using the AI model
 */
export async function generateAIText(
  model: LanguageModel,
  options: GenerateTextOptions,
): Promise<string> {
  try {
    const result = await generateText({
      model,
      system: options.system,
      prompt: options.prompt,
      messages: options.messages,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
    });
    return result.text;
  } catch (error) {
    const errorMessage = extractAIError(error);
    throw new AIServiceError(errorMessage, error);
  }
}

/**
 * Streams text using the AI model and writes to stdout
 */
export async function streamAIText(
  model: LanguageModel,
  options: GenerateTextOptions,
  onFirstChunk?: () => void,
  onStreamError?: (error: unknown) => void,
): Promise<void> {
  try {
    const result = streamText({
      model,
      system: options.system,
      prompt: options.prompt,
      messages: options.messages,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      onError: (error) => {
        // Stop spinner immediately when error occurs
        if (onFirstChunk) {
          onFirstChunk();
        }
        if (onStreamError) {
          onStreamError(error);
        }
        // Extract and throw the error with proper message
        const errorMessage = extractAIError(error);
        throw new AIServiceError(errorMessage, error);
      },
    });

    let isFirstChunk = true;
    for await (const textPart of result.textStream) {
      if (isFirstChunk && onFirstChunk) {
        onFirstChunk();
        isFirstChunk = false;
      }
      process.stdout.write(textPart);
    }
    process.stdout.write("\n");
  } catch (error) {
    // Handle any other errors that might occur
    if (onFirstChunk) {
      onFirstChunk();
    }
    if (onStreamError) {
      onStreamError(error);
    }

    if (error instanceof AIServiceError) {
      throw error; // Re-throw our custom error
    }

    const errorMessage = extractAIError(error);
    throw new AIServiceError(errorMessage, error);
  }
}

/**
 * Generates structured data with automatic JSON parsing and fixing
 */
export async function generateStructured<T>(
  model: LanguageModel,
  options: GenerateStructuredOptions<T>,
): Promise<StructuredResult<T>> {
  const text = await generateAIText(model, {
    ...options,
    system:
      options.system ||
      "You MUST respond with valid JSON only, no other text or formatting.",
  });

  // Parse with ai-json-fixer
  const parser = new LLMJSONParser();
  const parseResult = parser.tryParse(text, {
    mode: options.parseMode || "aggressive",
    stripMarkdown: true,
    trimTrailing: true,
    fixQuotes: true,
    addMissingCommas: true,
    trackFixes: true,
  });

  let validatedData: T | null = null;
  const warnings: string[] = [];

  if (parseResult.data) {
    // Validate with Zod schema if provided
    if (options.schema) {
      try {
        validatedData = options.schema.parse(parseResult.data);
      } catch (error) {
        warnings.push(
          `Schema validation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        validatedData = parseResult.data as T; // Fallback to unvalidated data
      }
    } else {
      validatedData = parseResult.data as T;
    }
  }

  // Add parser warnings
  if (parseResult.warnings) {
    warnings.push(...parseResult.warnings);
  }

  return {
    data: validatedData,
    fixes: parseResult.fixes?.length || 0,
    warnings: warnings.length > 0 ? warnings : undefined,
    rawText: text,
  };
}

/**
 * Generates structured data using the AI SDK's generateObject (when supported)
 * Falls back to JSON parsing if generateObject fails
 */
export async function generateAIObject<T>(
  model: LanguageModel,
  schema: z.ZodSchema<T>,
  options: GenerateTextOptions,
): Promise<T> {
  try {
    const result = await generateObject({
      model,
      schema,
      system: options.system,
      prompt: options.prompt,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
    });
    return result.object;
  } catch (error) {
    // Fallback to structured generation with JSON parsing
    const structuredResult = await generateStructured(model, {
      ...options,
      schema,
    });

    if (!structuredResult.data) {
      throw new AIServiceError("Failed to generate structured object", error);
    }

    return structuredResult.data;
  }
}
