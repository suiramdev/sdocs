import { getLLMSIndex } from "@/features/docs/utils/llms";

export const revalidate = false;

export const GET = async (request: Request): Promise<Response> =>
  new Response(await getLLMSIndex(request), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
