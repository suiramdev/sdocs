import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSignatureService } from "@/lib/sdk/service";

export const runtime = "nodejs";

const requestSchema = z.object({
  id: z.string().trim().min(1),
});

export async function GET(request: NextRequest) {
  try {
    const parsed = requestSchema.parse({
      id: request.nextUrl.searchParams.get("id") ?? "",
    });

    const result = await getSignatureService(parsed);
    if (!result.signature) {
      return NextResponse.json(
        {
          error: "Signature not found",
          id: parsed.id,
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
          error: "Invalid request",
          issues: error.flatten(),
        },
        {
          status: 400,
        }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to retrieve signature",
      },
      {
        status: 500,
      }
    );
  }
}
