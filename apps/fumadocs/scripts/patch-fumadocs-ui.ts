import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CURRENT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const APPLICATION_DIRECTORY = dirname(CURRENT_DIRECTORY);
const FUMADOCS_UI_DIRECTORY = join(
  APPLICATION_DIRECTORY,
  "node_modules",
  "fumadocs-ui",
  "dist",
  "layouts",
  "docs"
);

const createPattern = (parts: string[]): RegExp =>
  new RegExp(parts.join(""), "u");

const REPLACEMENTS = [
  {
    filePath: join(FUMADOCS_UI_DIRECTORY, "index.js"),
    nextValue:
      "fd-docs-header [grid-area:header] sticky z-30 flex items-center ps-4 pe-2.5 border-b transition-colors backdrop-blur-sm md:hidden max-md:layout:[--fd-header-height:--spacing(14)] data-[transparent=false]:bg-fd-background/80",
    previousPattern: createPattern([
      "\\[grid-area:header\\] sticky ",
      "top-\\(--fd-docs-row-1\\) z-30 flex items-center ",
      "ps-4 pe-2\\.5 border-b transition-colors backdrop-blur-sm ",
      "h-\\(--fd-header-height\\) md:hidden ",
      "max-md:layout:\\[--fd-header-height:--spacing\\(14\\)\\] ",
      "data-\\[transparent=false\\]:bg-fd-background/80",
    ]),
  },
  {
    filePath: join(FUMADOCS_UI_DIRECTORY, "sidebar.js"),
    nextValue:
      "fd-docs-sidebar sticky z-20 [grid-area:sidebar] pointer-events-none *:pointer-events-auto md:layout:[--fd-sidebar-width:268px] max-md:hidden",
    previousPattern: createPattern([
      "sticky top-\\(--fd-docs-row-1\\) z-20 ",
      "\\[grid-area:sidebar\\] pointer-events-none \\*:pointer-events-auto ",
      "h-\\[calc\\(var\\(--fd-docs-height\\)-",
      "var\\(--fd-docs-row-1\\)\\)\\] ",
      "md:layout:\\[--fd-sidebar-width:268px\\] max-md:hidden",
    ]),
  },
  {
    filePath: join(FUMADOCS_UI_DIRECTORY, "page", "index.js"),
    nextValue:
      "fd-docs-toc sticky flex flex-col [grid-area:toc] pt-12 pe-4 pb-2 max-xl:hidden",
    previousPattern: createPattern([
      "sticky top-\\(--fd-docs-row-1\\) ",
      "h-\\[calc\\(var\\(--fd-docs-height\\)-",
      "var\\(--fd-docs-row-1\\)\\)\\] ",
      "flex flex-col \\[grid-area:toc\\] ",
      "w-\\(--fd-toc-width\\) pt-12 pe-4 pb-2 max-xl:hidden",
    ]),
  },
] as const;

const patchFile = async ({
  filePath,
  nextValue,
  previousPattern,
}: (typeof REPLACEMENTS)[number]): Promise<void> => {
  const source = await readFile(filePath, "utf8");

  if (source.includes(nextValue)) {
    return;
  }

  if (!previousPattern.test(source)) {
    throw new Error(`Expected class name was not found in ${filePath}.`);
  }

  await writeFile(filePath, source.replace(previousPattern, nextValue));
};

await Promise.all(REPLACEMENTS.map(patchFile));
