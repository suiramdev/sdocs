import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CURRENT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const APPLICATION_DIRECTORY = dirname(CURRENT_DIRECTORY);
const GENERATED_ASSET_DIRECTORY = join(
  APPLICATION_DIRECTORY,
  "generated",
  "tree-sitter-assets"
);
const requireFromCurrentModule = createRequire(import.meta.url);

const getGrammarPackageDirectory = (packageName: string): string =>
  dirname(dirname(dirname(requireFromCurrentModule.resolve(packageName))));

const copyAsset = async ({
  sourcePath,
  targetPath,
}: {
  sourcePath: string;
  targetPath: string;
}): Promise<void> => {
  await mkdir(dirname(targetPath), {
    recursive: true,
  });
  await copyFile(sourcePath, targetPath);
};

const webTreeSitterDirectory = dirname(
  requireFromCurrentModule.resolve("web-tree-sitter")
);
const bashDirectory = getGrammarPackageDirectory("tree-sitter-bash");
const csharpDirectory = getGrammarPackageDirectory("tree-sitter-c-sharp");
const jsonDirectory = getGrammarPackageDirectory("tree-sitter-json");

await Promise.all([
  copyAsset({
    sourcePath: join(webTreeSitterDirectory, "tree-sitter.wasm"),
    targetPath: join(
      GENERATED_ASSET_DIRECTORY,
      "web-tree-sitter",
      "tree-sitter.wasm"
    ),
  }),
  copyAsset({
    sourcePath: join(bashDirectory, "tree-sitter-bash.wasm"),
    targetPath: join(GENERATED_ASSET_DIRECTORY, "tree-sitter-bash.wasm"),
  }),
  copyAsset({
    sourcePath: join(bashDirectory, "queries", "highlights.scm"),
    targetPath: join(
      GENERATED_ASSET_DIRECTORY,
      "tree-sitter-bash",
      "queries",
      "highlights.scm"
    ),
  }),
  copyAsset({
    sourcePath: join(csharpDirectory, "tree-sitter-c_sharp.wasm"),
    targetPath: join(GENERATED_ASSET_DIRECTORY, "tree-sitter-c_sharp.wasm"),
  }),
  copyAsset({
    sourcePath: join(csharpDirectory, "queries", "highlights.scm"),
    targetPath: join(
      GENERATED_ASSET_DIRECTORY,
      "tree-sitter-c-sharp",
      "queries",
      "highlights.scm"
    ),
  }),
  copyAsset({
    sourcePath: join(jsonDirectory, "tree-sitter-json.wasm"),
    targetPath: join(GENERATED_ASSET_DIRECTORY, "tree-sitter-json.wasm"),
  }),
  copyAsset({
    sourcePath: join(jsonDirectory, "queries", "highlights.scm"),
    targetPath: join(
      GENERATED_ASSET_DIRECTORY,
      "tree-sitter-json",
      "queries",
      "highlights.scm"
    ),
  }),
]);
