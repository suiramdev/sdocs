import { encode } from "@toon-format/toon";

import { compactValue } from "./mcp-compact";

export const MCP_TOON_MIME_TYPE = "text/toon" as const;

const toJsonCompatiblePayload = (payload: unknown): unknown => {
  const serialized = JSON.stringify(payload);

  if (serialized === undefined) {
    return null;
  }

  return JSON.parse(serialized) as unknown;
};

export const encodeMcpContent = (payload: unknown): string =>
  encode(toJsonCompatiblePayload(compactValue(payload)));
