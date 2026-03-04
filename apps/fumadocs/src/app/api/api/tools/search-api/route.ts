import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { executeSearchApiTool } from "@/features/api/utils/tool-search-api";

export const runtime = "nodejs";

const inputSchema = z.object({
  limit: z.number().int().min(1).max(20).optional(),
  query: z.string().trim().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = inputSchema.parse(await request.json());
    const result = await executeSearchApiTool(body);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid search_api input",
          issues: error.flatten(),
        },
        {
          status: 400,
        }
      );
    }

    return NextResponse.json(
      {
        error: "search_api failed",
      },
      {
        status: 500,
      }
    );
  }
}
