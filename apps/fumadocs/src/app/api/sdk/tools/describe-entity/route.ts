import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { executeDescribeTool } from "@/lib/sdk/optional-tools";

export const runtime = "nodejs";

const inputSchema = z.object({
  id: z.string().trim().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = inputSchema.parse(await request.json());
    const result = await executeDescribeTool(body);

    if (!result.entity) {
      return NextResponse.json(
        {
          error: "Entity not found",
          id: body.id,
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid sdk_describe_entity input",
          issues: error.flatten(),
        },
        {
          status: 400,
        }
      );
    }

    return NextResponse.json(
      {
        error: "sdk_describe_entity failed",
      },
      {
        status: 500,
      }
    );
  }
}
