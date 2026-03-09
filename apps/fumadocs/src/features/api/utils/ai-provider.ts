export type AiProvider = "chutes" | "openai";

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

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

export const getMeiliEmbedderProviderConfig = (): ProviderConfig => {
  const provider = normalizeProvider(
    process.env.MEILI_EMBEDDER_PROVIDER,
    "openai"
  );
  return buildProviderConfig(provider);
};
