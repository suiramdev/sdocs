import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  executeSearchSboxDocsTool,
  searchSboxDocsToolInputSchema,
} from "@/features/sdk/utils/tool-search-sbox-docs";

export const runtime = "nodejs";

export const POST = async (request: NextRequest) => {
  try {
    const body = searchSboxDocsToolInputSchema.parse(await request.json());
    const result = await executeSearchSboxDocsTool(body);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid search_sbox_docs input",
          issues: error.flatten(),
        },
        {
          status: 400,
        }
      );
    }

    return NextResponse.json(
      {
        error: "search_sbox_docs failed",
      },
      {
        status: 500,
      }
    );
  }
};
