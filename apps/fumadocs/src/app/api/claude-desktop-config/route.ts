import type { NextRequest } from "next/server";

import { redirectToLatestApiVersion } from "@/app/api/utils/versioned-redirect";

export const runtime = "nodejs";

export const GET = (request: NextRequest) =>
  redirectToLatestApiVersion(request, "/api/v1/claude-desktop-config");
