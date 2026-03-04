import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { answerApiQuestion } from "@/features/api/utils/rag";

export const runtime = "nodejs";

const inputSchema = z.object({
  limit: z.number().int().min(1).max(20).optional(),
  question: z.string().trim().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = inputSchema.parse(await request.json());
    const answer = await answerApiQuestion(body);

    return NextResponse.json(answer);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid API RAG request",
          issues: error.flatten(),
        },
        {
          status: 400,
        }
      );
    }

    return NextResponse.json(
      {
        error: "API RAG request failed",
      },
      {
        status: 500,
      }
    );
  }
}
