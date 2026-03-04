import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { searchSboxDocsService } from "@/features/sdk/utils/sbox-search";
import { sdkEntityTypes } from "@/features/sdk/utils/schemas";

export const runtime = "nodejs";

const querySchema = z.object({
  className: z.string().trim().min(1).optional(),
  includeObsolete: z
    .string()
    .optional()
    .transform((value) => value === "1" || value === "true"),
  limit: z.coerce.number().int().min(1).max(25).optional(),
  namespace: z.string().trim().min(1).optional(),
  q: z.string().trim().min(1),
  type: z.enum(sdkEntityTypes).optional(),
  useHybrid: z
    .string()
    .optional()
    .transform((value) => value === "1" || value === "true"),
});

const bodySchema = z.object({
  className: z.string().trim().min(1).optional(),
  includeObsolete: z.boolean().optional(),
  limit: z.number().int().min(1).max(25).optional(),
  namespace: z.string().trim().min(1).optional(),
  query: z.string().trim().min(1),
  type: z.enum(sdkEntityTypes).optional(),
  useHybrid: z.boolean().optional(),
});

export const GET = async (request: NextRequest) => {
  try {
    const parsed = querySchema.parse({
      className: request.nextUrl.searchParams.get("className") ?? undefined,
      includeObsolete:
        request.nextUrl.searchParams.get("includeObsolete") ?? undefined,
      limit: request.nextUrl.searchParams.get("limit") ?? undefined,
      namespace: request.nextUrl.searchParams.get("namespace") ?? undefined,
      q: request.nextUrl.searchParams.get("q") ?? "",
      type: request.nextUrl.searchParams.get("type") ?? undefined,
      useHybrid: request.nextUrl.searchParams.get("useHybrid") ?? undefined,
    });

    const response = await searchSboxDocsService({
      className: parsed.className,
      includeObsolete: parsed.includeObsolete,
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
          error: "Invalid s&box search query",
          issues: error.flatten(),
        },
        {
          status: 400,
        }
      );
    }

    return NextResponse.json(
      {
        error: "s&box search failed",
      },
      {
        status: 500,
      }
    );
  }
};

export const POST = async (request: NextRequest) => {
  try {
    const body = bodySchema.parse(await request.json());
    const response = await searchSboxDocsService({
      className: body.className,
      includeObsolete: body.includeObsolete,
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
          error: "Invalid s&box search request",
          issues: error.flatten(),
        },
        {
          status: 400,
        }
      );
    }

    return NextResponse.json(
      {
        error: "s&box search failed",
      },
      {
        status: 500,
      }
    );
  }
};
