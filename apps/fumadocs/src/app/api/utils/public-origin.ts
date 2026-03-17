const DEFAULT_PUBLIC_APP_BASE_URL = "http://localhost:4000";

const normalizeBaseUrl = (value: string | undefined): string | undefined => {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return undefined;
  }

  return trimmedValue.replace(/\/+$/u, "");
};

export const getPublicAppOrigin = (request: Request): string =>
  normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_BASE_URL) ??
  normalizeBaseUrl(process.env.APP_BASE_URL) ??
  new URL(request.url).origin ??
  DEFAULT_PUBLIC_APP_BASE_URL;
