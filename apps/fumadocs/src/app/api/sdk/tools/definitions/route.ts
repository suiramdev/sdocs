import { NextResponse } from "next/server";

import {
  sdkDescribeTool,
  sdkSignatureTool,
} from "@/features/sdk/utils/optional-tools";
import { searchSboxDocsTool } from "@/features/sdk/utils/tool-search-sbox-docs";
import { searchSdkTool } from "@/features/sdk/utils/tool-search-sdk";

export const runtime = "nodejs";

export const GET = () =>
  NextResponse.json({
    tools: [
      searchSdkTool,
      searchSboxDocsTool,
      sdkDescribeTool,
      sdkSignatureTool,
    ],
  });
