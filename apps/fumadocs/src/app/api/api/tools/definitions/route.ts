import { NextResponse } from "next/server";

import {
  apiDescribeTool,
  apiSignatureTool,
} from "@/features/api/utils/optional-tools";
import { searchSboxDocsTool } from "@/features/api/utils/tool-search-sbox-docs";
import { searchApiTool } from "@/features/api/utils/tool-search-api";

export const runtime = "nodejs";

export const GET = () =>
  NextResponse.json({
    tools: [
      searchApiTool,
      searchSboxDocsTool,
      apiDescribeTool,
      apiSignatureTool,
    ],
  });
