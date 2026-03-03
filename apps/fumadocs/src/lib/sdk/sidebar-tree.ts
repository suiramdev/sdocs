import type { Folder, Root } from "fumadocs-core/page-tree";

import { loadSdkEntities } from "@/lib/sdk/data";
import type { SdkEntity } from "@/lib/sdk/schemas";

type MethodEntity = SdkEntity & { type: "method" };
type ClassBuckets = Map<string, MethodEntity[]>;
type NamespaceBuckets = Map<string, ClassBuckets>;

const SDK_ROOT_URL = "/docs/sdk";
const SDK_FOLDER_NAME = "SDK Methods";

let cachedSdkFolder: Folder | null = null;

const isMethodEntity = (entity: SdkEntity): entity is MethodEntity =>
  entity.type === "method";

const compareText = (left: string, right: string): number =>
  left.localeCompare(right);

const compareMethods = (left: MethodEntity, right: MethodEntity): number => {
  const nameCompare = compareText(left.name, right.name);
  if (nameCompare === 0) {
    return compareText(left.signature, right.signature);
  }

  return nameCompare;
};

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

const buildNamespaceBuckets = (methods: MethodEntity[]): NamespaceBuckets => {
  const namespaces: NamespaceBuckets = new Map();

  for (const method of methods) {
    const classBuckets = getOrCreate(
      namespaces,
      method.namespace,
      () => new Map<string, MethodEntity[]>()
    );
    const methodList = getOrCreate(classBuckets, method.class, () => []);
    methodList.push(method);
  }

  return namespaces;
};

const toMethodItems = (
  methods: MethodEntity[]
): { name: string; type: "page"; url: string }[] =>
  methods.map((method) => ({
    name: method.displaySignature,
    type: "page",
    url: method.url,
  }));

const toClassFolders = (classBuckets: ClassBuckets): Folder[] =>
  [...classBuckets.keys()].toSorted(compareText).flatMap((className) => {
    const methods = classBuckets.get(className);
    if (!methods?.length) {
      return [];
    }

    return [
      {
        children: toMethodItems(methods),
        collapsible: true,
        defaultOpen: false,
        name: className,
        type: "folder",
      },
    ];
  });

const toNamespaceFolders = (namespaces: NamespaceBuckets): Folder[] =>
  [...namespaces.keys()].toSorted(compareText).flatMap((namespaceName) => {
    const classBuckets = namespaces.get(namespaceName);
    if (!classBuckets) {
      return [];
    }

    return [
      {
        children: toClassFolders(classBuckets),
        collapsible: true,
        defaultOpen: false,
        name: namespaceName,
        type: "folder",
      },
    ];
  });

const buildSdkMethodsFolder = async (): Promise<Folder> => {
  const entities = await loadSdkEntities();
  const methods = entities.filter(isMethodEntity).toSorted(compareMethods);
  const namespaces = buildNamespaceBuckets(methods);

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

const getSdkMethodsFolder = async (): Promise<Folder> => {
  if (cachedSdkFolder) {
    return cachedSdkFolder;
  }

  cachedSdkFolder = await buildSdkMethodsFolder();
  return cachedSdkFolder;
};

const isSdkMethodsFolder = (node: Root["children"][number]): boolean =>
  node.type === "folder" &&
  (node.index?.url === SDK_ROOT_URL || node.name === SDK_FOLDER_NAME);

export const mergeSdkMethodsTree = async (baseTree: Root): Promise<Root> => {
  const sdkFolder = await getSdkMethodsFolder();

  return {
    ...baseTree,
    children: [
      ...baseTree.children.filter((node) => !isSdkMethodsFolder(node)),
      sdkFolder,
    ],
  };
};
