import { source } from "@/features/docs/utils/source";

export const revalidate = false;

export const GET = () => {
  const lines: string[] = [
    "# s&box Documentation",
    "",
    ...source
      .getPages()
      .map(
        (page) =>
          `- [${page.data.title}](${page.url}): ${page.data.description}`,
      ),
  ];

  return new Response(lines.join("\n"));
};
