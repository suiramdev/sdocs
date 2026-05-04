import { getFullLLMText } from "@/features/docs/utils/llms";

export const revalidate = false;

export const GET = async (): Promise<Response> =>
  new Response(await getFullLLMText(), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
