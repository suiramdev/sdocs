import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getPublicAppOrigin } from "@/app/api/utils/public-origin";

const LATEST_REDIRECT_STATUS = 307;

export const redirectToLatestApiVersion = (
  request: NextRequest,
  pathname: string
) => {
  const url = new URL(pathname, `${getPublicAppOrigin(request)}/`);

  return NextResponse.redirect(url, {
    headers: {
      "Cache-Control": "public, max-age=300",
    },
    status: LATEST_REDIRECT_STATUS,
  });
};
