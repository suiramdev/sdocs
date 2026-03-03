import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { executeSignatureTool } from "@/lib/sdk/optional-tools";

export const runtime = "nodejs";

const inputSchema = z.object({
  id: z.string().trim().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = inputSchema.parse(await request.json());
    const result = await executeSignatureTool(body);

    if (!result.signature) {
      return NextResponse.json(
        {
          error: "Signature not found",
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
          error: "Invalid sdk_get_signature input",
          issues: error.flatten(),
        },
        {
          status: 400,
        }
      );
    }

    return NextResponse.json(
      {
        error: "sdk_get_signature failed",
      },
      {
        status: 500,
      }
    );
  }
}
