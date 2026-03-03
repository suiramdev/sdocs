import type { Folder, Root } from "fumadocs-core/page-tree";

import { loadSdkEntities } from "@/lib/sdk/data";
import type { SdkEntity } from "@/lib/sdk/schemas";

type MethodEntity = SdkEntity & { type: "method" };
type PropertyEntity = SdkEntity & { type: "property" };
type TypeEntity = SdkEntity & { type: "class" | "enum" };
interface TypePageNode {
  name: string;
  type: "page";
  url: string;
}

interface TypeBucket {
  fallbackUrl: string | null;
  typeEntity: TypeEntity | null;
}

type TypeBuckets = Map<string, TypeBucket>;
type NamespaceBuckets = Map<string, TypeBuckets>;

const SDK_ROOT_URL = "/docs/sdk";
const SDK_FOLDER_NAME = "SDK API Reference";

let cachedSdkFolder: Folder | null = null;

const isMethodEntity = (entity: SdkEntity): entity is MethodEntity =>
  entity.type === "method";

const isPropertyEntity = (entity: SdkEntity): entity is PropertyEntity =>
  entity.type === "property";

const isMemberEntity = (
  entity: SdkEntity
): entity is MethodEntity | PropertyEntity =>
  isMethodEntity(entity) || isPropertyEntity(entity);

const isTypeEntity = (entity: SdkEntity): entity is TypeEntity =>
  entity.type === "class" || entity.type === "enum";

const compareText = (left: string, right: string): number =>
  left.localeCompare(right);

const getOrCreate = <TKey, TValue>(
  map: Map<TKey, TValue>,
  key: TKey,
  factory: () => TValue
): TValue => {
  const existing = map.get(key);
  if (existing) {
    return existing;
  }

  const created = factory();
  map.set(key, created);
  return created;
};

const getOrCreateTypeBucket = (
  namespaces: NamespaceBuckets,
  namespaceName: string,
  className: string
): TypeBucket => {
  const typeBuckets = getOrCreate(namespaces, namespaceName, () => new Map());

  return getOrCreate(typeBuckets, className, () => ({
    fallbackUrl: null,
    typeEntity: null,
  }));
};

const normalizeMemberUrl = (entity: MethodEntity | PropertyEntity): string => {
  if (entity.canonicalUrl && entity.canonicalUrl.length > 0) {
    return entity.canonicalUrl;
  }

  return entity.url.replace(/\/(methods|properties)\/[^/]+$/u, "");
};

const appendEntityToBucket = (bucket: TypeBucket, entity: SdkEntity): void => {
  if (isTypeEntity(entity)) {
    bucket.typeEntity = entity;
    return;
  }

  if (!isMemberEntity(entity) || bucket.fallbackUrl) {
    return;
  }

  bucket.fallbackUrl = normalizeMemberUrl(entity);
};

const buildNamespaceBuckets = (entities: SdkEntity[]): NamespaceBuckets => {
  const namespaces: NamespaceBuckets = new Map();

  for (const entity of entities) {
    const bucket = getOrCreateTypeBucket(
      namespaces,
      entity.namespace,
      entity.class
    );
    appendEntityToBucket(bucket, entity);
  }

  return namespaces;
};

const toTypeLabel = (className: string, bucket: TypeBucket): string =>
  bucket.typeEntity?.name ?? className.split(".").at(-1) ?? className;

const toTypePage = (
  className: string,
  bucket: TypeBucket
): TypePageNode | null => {
  const typeUrl = bucket.typeEntity?.url ?? bucket.fallbackUrl;

  if (!typeUrl) {
    return null;
  }

  return {
    name: toTypeLabel(className, bucket),
    type: "page",
    url: typeUrl,
  };
};

const toNamespaceFolders = (namespaces: NamespaceBuckets): Folder[] =>
  [...namespaces.entries()]
    .toSorted((left, right) => compareText(left[0], right[0]))
    .flatMap(([namespaceName, typeBuckets]) => {
      const typePages = [...typeBuckets.entries()]
        .toSorted((left, right) => compareText(left[0], right[0]))
        .flatMap(([className, bucket]) => {
          const page = toTypePage(className, bucket);
          return page ? [page] : [];
        });

      if (typePages.length === 0) {
        return [];
      }

      return [
        {
          children: typePages,
          collapsible: true,
          defaultOpen: false,
          name: namespaceName,
          type: "folder" as const,
        },
      ];
    });

const buildSdkReferenceFolder = async (): Promise<Folder> => {
  const entities = await loadSdkEntities();
  const namespaces = buildNamespaceBuckets(entities);

  return {
    children: toNamespaceFolders(namespaces),
    collapsible: true,
    defaultOpen: false,
    index: {
      name: "SDK Reference",
      type: "page",
      url: SDK_ROOT_URL,
    },
    name: SDK_FOLDER_NAME,
    type: "folder",
  };
};

const getSdkReferenceFolder = async (): Promise<Folder> => {
  if (cachedSdkFolder) {
    return cachedSdkFolder;
  }

  cachedSdkFolder = await buildSdkReferenceFolder();
  return cachedSdkFolder;
};

const isSdkFolder = (node: Root["children"][number]): boolean =>
  node.type === "folder" &&
  (node.index?.url === SDK_ROOT_URL || node.name === SDK_FOLDER_NAME);

export const mergeSdkMethodsTree = async (baseTree: Root): Promise<Root> => {
  const sdkFolder = await getSdkReferenceFolder();

  return {
    ...baseTree,
    children: [
      ...baseTree.children.filter((node) => !isSdkFolder(node)),
      sdkFolder,
    ],
  };
};
