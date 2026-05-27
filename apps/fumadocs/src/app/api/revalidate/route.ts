import { revalidateTag } from "next/cache";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { API_ENTITIES_CACHE_TAG } from "@/features/api/utils/data";
import { TUTORIAL_DOCS_CACHE_TAG } from "@/features/learn-docs/utils/source";
import { OFFICIAL_DOCS_CACHE_TAG } from "@/features/official-docs/utils/source";

const TAG_ACTIONS: Record<string, () => void> = {
  [API_ENTITIES_CACHE_TAG]: () => revalidateTag(API_ENTITIES_CACHE_TAG, {}),
  [OFFICIAL_DOCS_CACHE_TAG]: () => revalidateTag(OFFICIAL_DOCS_CACHE_TAG, {}),
  [TUTORIAL_DOCS_CACHE_TAG]: () => revalidateTag(TUTORIAL_DOCS_CACHE_TAG, {}),
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = request.nextUrl.searchParams.get("secret");

  if (secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  const tag = request.nextUrl.searchParams.get("tag");
  const action = tag ? TAG_ACTIONS[tag] : undefined;

  if (!action) {
    return NextResponse.json(
      { error: `Unknown tag. Allowed: ${Object.keys(TAG_ACTIONS).join(", ")}` },
      { status: 400 }
    );
  }

  action();

  return NextResponse.json({ revalidated: true, tag });
}
