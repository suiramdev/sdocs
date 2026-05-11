import "server-only";
import { createHash } from "node:crypto";

type UmamiEventValue = boolean | number | string;

export type ServerUmamiEventData = Record<string, UmamiEventValue>;

interface ServerUmamiEvent {
  data?: ServerUmamiEventData;
  name: string;
  request: Request;
  title?: string;
  url?: string;
}

const DEFAULT_LANGUAGE = "en-US";
const DEFAULT_SCREEN = "0x0";
const LOCALHOST = "localhost";
const UMAMI_EVENT_ENDPOINT = "/api/send";

const trimEnv = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed || undefined;
};

const websiteId = trimEnv(
  process.env.UMAMI_WEBSITE_ID ?? process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID
);
const hostUrl = trimEnv(
  process.env.UMAMI_HOST_URL ?? process.env.NEXT_PUBLIC_UMAMI_HOST_URL
);
const scriptUrl = trimEnv(
  process.env.UMAMI_SCRIPT_URL ?? process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL
);
const eventTag = trimEnv(
  process.env.UMAMI_TAG ?? process.env.NEXT_PUBLIC_UMAMI_TAG
);
const actorSalt = trimEnv(process.env.UMAMI_MCP_ID_SALT);

const inferUmamiHostUrl = (): string | undefined => {
  if (hostUrl) {
    return hostUrl;
  }

  if (!scriptUrl) {
    return;
  }

  try {
    return new URL(scriptUrl).origin;
  } catch {
    // Invalid script URLs disable server-side analytics automatically.
  }
};

const umamiHostUrl = inferUmamiHostUrl();

const normalizePath = (value: string | undefined): string => {
  if (!value) {
    return "/";
  }

  try {
    const parsedUrl = new URL(value);
    return `${parsedUrl.pathname}${parsedUrl.search}`;
  } catch {
    return value.startsWith("/") ? value : `/${value}`;
  }
};

const getRequestHostname = (request: Request): string => {
  const forwardedHost = request.headers.get("x-forwarded-host");

  if (forwardedHost) {
    return forwardedHost.split(",")[0]?.trim() ?? LOCALHOST;
  }

  const host = request.headers.get("host");

  if (host) {
    return host;
  }

  try {
    return new URL(request.url).hostname;
  } catch {
    return LOCALHOST;
  }
};

const getClientIp = (request: Request): string | undefined => {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim();
  }

  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    undefined
  );
};

const getActorId = (request: Request): string | undefined => {
  if (!actorSalt) {
    return;
  }

  const userAgent = request.headers.get("user-agent") ?? "";
  const acceptLanguage = request.headers.get("accept-language") ?? "";
  const clientIp = getClientIp(request) ?? "";

  if (!userAgent && !clientIp) {
    return;
  }

  return createHash("sha256")
    .update(actorSalt)
    .update("|")
    .update(clientIp)
    .update("|")
    .update(userAgent)
    .update("|")
    .update(acceptLanguage)
    .digest("hex")
    .slice(0, 24);
};

const getLanguage = (request: Request): string => {
  const acceptLanguage = request.headers.get("accept-language");
  return acceptLanguage?.split(",")[0]?.trim() || DEFAULT_LANGUAGE;
};

const buildEndpoint = (): string | undefined => {
  if (!(websiteId && umamiHostUrl)) {
    return;
  }

  return new URL(UMAMI_EVENT_ENDPOINT, umamiHostUrl).toString();
};

const eventEndpoint = buildEndpoint();

export const getServerAnalyticsClientData = (
  request: Request
): ServerUmamiEventData => {
  const userAgent = request.headers.get("user-agent") ?? "unknown";
  const actorId = getActorId(request);

  return {
    ...(actorId ? { actor_id: actorId } : {}),
    user_agent: userAgent.slice(0, 160),
  };
};

export const trackServerUmamiEvent = async ({
  data,
  name,
  request,
  title,
  url,
}: ServerUmamiEvent): Promise<void> => {
  if (!(eventEndpoint && websiteId)) {
    return;
  }

  const eventUrl = normalizePath(url ?? request.url);
  const payload = {
    payload: {
      data,
      hostname: getRequestHostname(request),
      language: getLanguage(request),
      name,
      referrer: request.headers.get("referer") ?? "",
      screen: DEFAULT_SCREEN,
      tag: eventTag,
      title: title ?? name,
      url: eventUrl,
      website: websiteId,
    },
    type: "event",
  };

  try {
    await fetch(eventEndpoint, {
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          request.headers.get("user-agent") ?? "sdocs-server-analytics",
      },
      method: "POST",
    });
  } catch {
    // Analytics must never affect API or MCP responses.
  }
};
