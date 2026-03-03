import { NextResponse } from "next/server";

import { sdkDescribeTool, sdkSignatureTool } from "@/lib/sdk/optional-tools";
import { searchSdkTool } from "@/lib/sdk/tool-search-sdk";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    tools: [searchSdkTool, sdkDescribeTool, sdkSignatureTool],
  });
}
