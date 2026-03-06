import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

export type AiProvider = "chutes" | "openai";

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_RAG_MODEL = "gpt-4.1-mini";

interface ProviderConfig {
  apiKey: string | null;
  baseUrl: string | null;
  provider: AiProvider;
}

const normalizeProvider = (
  rawValue: string | undefined,
  fallback: AiProvider
): AiProvider => {
  if (rawValue === "chutes") {
    return "chutes";
  }

  return fallback;
};

const normalizeBaseUrl = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
};

const buildProviderConfig = (provider: AiProvider): ProviderConfig => {
  if (provider === "chutes") {
    return {
      apiKey: process.env.CHUTES_API_KEY?.trim() || null,
      baseUrl: normalizeBaseUrl(process.env.CHUTES_API_BASE_URL),
      provider,
    };
  }

  return {
    apiKey: process.env.OPENAI_API_KEY?.trim() || null,
    baseUrl:
      normalizeBaseUrl(process.env.OPENAI_API_BASE_URL) ??
      normalizeBaseUrl(DEFAULT_OPENAI_BASE_URL),
    provider,
  };
};

export const buildProviderUrl = (
  baseUrl: string,
  pathName: "chat/completions" | "embeddings"
): string => new URL(pathName, baseUrl).toString();

export const getRagProviderConfig = (): ProviderConfig => {
  const provider = normalizeProvider(process.env.API_RAG_PROVIDER, "openai");
  return buildProviderConfig(provider);
};

const getRagModelId = (provider: AiProvider): string | null => {
  const configuredModel = process.env.API_RAG_MODEL?.trim();
  if (configuredModel) {
    return configuredModel;
  }

  if (provider === "openai") {
    return DEFAULT_OPENAI_RAG_MODEL;
  }

  return null;
};

export const getRagLanguageModel = (): LanguageModel | null => {
  const providerConfig = getRagProviderConfig();
  const modelId = getRagModelId(providerConfig.provider);

  if (!providerConfig.apiKey || !providerConfig.baseUrl || !modelId) {
    return null;
  }

  if (providerConfig.provider === "chutes") {
    return createOpenAICompatible({
      apiKey: providerConfig.apiKey,
      baseURL: providerConfig.baseUrl,
      name: "chutes",
    }).chatModel(modelId);
  }

  return createOpenAI({
    apiKey: providerConfig.apiKey,
    baseURL: providerConfig.baseUrl,
    name: "openai",
  }).chat(modelId);
};

export const getMeiliEmbedderProviderConfig = (): ProviderConfig => {
  const provider = normalizeProvider(
    process.env.MEILI_EMBEDDER_PROVIDER,
    "openai"
  );
  return buildProviderConfig(provider);
};
