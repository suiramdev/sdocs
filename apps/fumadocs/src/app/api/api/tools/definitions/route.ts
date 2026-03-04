import { NextResponse } from "next/server";

import {
  apiDescribeTool,
  apiSignatureTool,
} from "@/features/api/utils/optional-tools";
import { searchApiTool } from "@/features/api/utils/tool-search-api";
import { searchSboxDocsTool } from "@/features/api/utils/tool-search-sbox-docs";

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
