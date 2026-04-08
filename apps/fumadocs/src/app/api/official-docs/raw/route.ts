import { NextResponse } from "next/server";

import { getOfficialDocPage } from "@/features/official-docs/utils/source";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug") ?? "";
  const page = await getOfficialDocPage(
    slug
      .split("/")
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0)
  );

  if (!page) {
    return NextResponse.json(
      {
        error: "Official document not found",
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
