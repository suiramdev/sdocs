import { NextResponse } from "next/server";

import {
  sdkDescribeTool,
  sdkSignatureTool,
} from "@/features/sdk/utils/optional-tools";
import { searchSdkTool } from "@/features/sdk/utils/tool-search-sdk";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    tools: [searchSdkTool, sdkDescribeTool, sdkSignatureTool],
  });
}
