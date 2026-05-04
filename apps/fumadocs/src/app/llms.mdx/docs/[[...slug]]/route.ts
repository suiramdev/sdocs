import { notFound } from "next/navigation";

import { getEntityByUrl } from "@/features/api/utils/data";
import {
  getApiEntityLLMText,
  getApiIndexLLMText,
  getGuideLLMText,
} from "@/features/docs/utils/llms";
import { source } from "@/features/docs/utils/source";

export const revalidate = false;

const markdownResponse = (body: string): Response =>
  new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });

const getApiMarkdownResponse = async (slug: string[]): Promise<Response> => {
  if (slug.length === 1) {
    return markdownResponse(await getApiIndexLLMText());
  }

  const entity = await getEntityByUrl(`/docs/${slug.join("/")}`);
  if (!entity) {
    notFound();
  }

  return markdownResponse(await getApiEntityLLMText(entity));
};

export const GET = async (
  _req: Request,
  { params }: RouteContext<"/llms.mdx/docs/[[...slug]]">
): Promise<Response> => {
  const { slug } = await params;
  if (slug?.[0] === "api") {
    return getApiMarkdownResponse(slug);
  }

  const page = source.getPage(slug);
  if (!page) {
    notFound();
  }

  return markdownResponse(await getGuideLLMText(page));
};

export const generateStaticParams = () => {
  return source.generateParams();
};
