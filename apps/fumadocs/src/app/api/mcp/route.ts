import type { NextRequest } from "next/server";

import { redirectToLatestApiVersion } from "@/app/api/utils/versioned-redirect";

export const runtime = "nodejs";

const handleLatestMcpRoute = (request: NextRequest) =>
  redirectToLatestApiVersion(request, "/api/v1/mcp");

export const DELETE = handleLatestMcpRoute;
export const GET = handleLatestMcpRoute;
export const POST = handleLatestMcpRoute;
