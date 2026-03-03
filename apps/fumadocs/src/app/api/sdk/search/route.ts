import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { searchSdkService } from "@/lib/sdk/service";

export const runtime = "nodejs";

const querySchema = z.object({
  className: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  namespace: z.string().trim().min(1).optional(),
  q: z.string().trim().min(1),
  type: z.enum(["class", "method", "enum", "property"]).optional(),
  useHybrid: z
    .string()
    .optional()
    .transform((value) => value === "1" || value === "true"),
});

const bodySchema = z.object({
  className: z.string().trim().min(1).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  namespace: z.string().trim().min(1).optional(),
  query: z.string().trim().min(1),
  type: z.enum(["class", "method", "enum", "property"]).optional(),
  useHybrid: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const parsed = querySchema.parse({
      className: request.nextUrl.searchParams.get("className") ?? undefined,
      limit: request.nextUrl.searchParams.get("limit") ?? undefined,
      namespace: request.nextUrl.searchParams.get("namespace") ?? undefined,
      q: request.nextUrl.searchParams.get("q") ?? "",
      type: request.nextUrl.searchParams.get("type") ?? undefined,
      useHybrid: request.nextUrl.searchParams.get("useHybrid") ?? undefined,
    });

    const response = await searchSdkService({
      className: parsed.className,
      limit: parsed.limit,
      namespace: parsed.namespace,
      query: parsed.q,
      type: parsed.type,
      useHybrid: parsed.useHybrid,
    });

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid search query",
          issues: error.flatten(),
        },
        {
          status: 400,
        }
      );
    }

    return NextResponse.json(
      {
        error: "SDK search failed",
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = bodySchema.parse(await request.json());
    const response = await searchSdkService({
      className: body.className,
      limit: body.limit,
      namespace: body.namespace,
      query: body.query,
      type: body.type,
      useHybrid: body.useHybrid,
    });

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          issues: error.flatten(),
        },
        {
          status: 400,
        }
      );
    }

    return NextResponse.json(
      {
        error: "SDK search failed",
      },
      {
        status: 500,
      }
    );
  }
}
