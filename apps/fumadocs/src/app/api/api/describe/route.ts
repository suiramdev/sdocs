import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { describeApiEntityService } from "@/features/api/utils/service";

export const runtime = "nodejs";

const requestSchema = z.object({
  id: z.string().trim().min(1),
});

export async function GET(request: NextRequest) {
  try {
    const parsed = requestSchema.parse({
      id: request.nextUrl.searchParams.get("id") ?? "",
    });

    const result = await describeApiEntityService(parsed);
    if (!result.entity) {
      return NextResponse.json(
        {
          error: "Entity not found",
        },
        {
          status: 404,
        },
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
        },
      );
    }

    return NextResponse.json(
      {
        error: "Failed to describe entity",
      },
      {
        status: 500,
      },
    );
  }
}
