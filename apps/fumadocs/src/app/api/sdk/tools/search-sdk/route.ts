import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { executeSearchSdkTool } from "@/features/sdk/utils/tool-search-sdk";

export const runtime = "nodejs";

const inputSchema = z.object({
  limit: z.number().int().min(1).max(20).optional(),
  query: z.string().trim().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = inputSchema.parse(await request.json());
    const result = await executeSearchSdkTool(body);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid search_sdk input",
          issues: error.flatten(),
        },
        {
          status: 400,
        }
      );
    }

    return NextResponse.json(
      {
        error: "search_sdk failed",
      },
      {
        status: 500,
      }
    );
  }
}
