import { NextResponse } from "next/server";

import { getTutorialDocPage } from "@/features/learn-docs/utils/source";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug") ?? "";
  const page = await getTutorialDocPage(slug);

  if (!page) {
    return NextResponse.json(
      {
        error: "Tutorial not found",
      },
      {
        status: 404,
      }
    );
  }

  return new NextResponse(page.rawMarkdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
};
