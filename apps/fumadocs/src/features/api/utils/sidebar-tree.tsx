import type { Folder, Root, Node } from "fumadocs-core/page-tree";
import { unstable_cache } from "next/cache";

import {
  loadApiEntities,
  API_ENTITIES_CACHE_TAG,
} from "@/features/api/utils/data";
import { buildApiEntityAnchor } from "@/features/api/utils/reference";
import type { ApiEntity } from "@/features/api/utils/schemas";
import {
  getTutorialDocsSectionTree,
  TUTORIAL_DOCS_FOLDER_NAME,
  TUTORIAL_DOCS_FOLDER_URL,
} from "@/features/learn-docs/utils/source";
import {
  getOfficialDocsSectionTree,
  OFFICIAL_DOCS_FOLDER_NAME,
  OFFICIAL_DOCS_FOLDER_URL,
} from "@/features/official-docs/utils/source";

type MethodEntity = ApiEntity & { type: "method" };
type PropertyEntity = ApiEntity & { type: "property" };
type TypeEntity = ApiEntity & { type: "class" | "enum" };

interface TypeBucket {
  fallbackUrl: string | null;
  typeEntity: TypeEntity | null;
}

type TypeBuckets = Map<string, TypeBucket>;
type NamespaceBuckets = Map<string, TypeBuckets>;

const API_ROOT_URL = "/docs/api";
const GET_STARTED_URL = "/docs/get-started";
const API_FOLDER_NAME = "API Reference";

const isMethodEntity = (entity: ApiEntity): entity is MethodEntity =>
  entity.type === "method";

const isPropertyEntity = (entity: ApiEntity): entity is PropertyEntity =>
  entity.type === "property";

const isMemberEntity = (
  entity: ApiEntity
): entity is MethodEntity | PropertyEntity =>
  isMethodEntity(entity) || isPropertyEntity(entity);

const isTypeEntity = (entity: ApiEntity): entity is TypeEntity =>
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

const appendEntityToBucket = (bucket: TypeBucket, entity: ApiEntity): void => {
  if (isTypeEntity(entity)) {
    bucket.typeEntity = entity;
    return;
  }

  if (!isMemberEntity(entity) || bucket.fallbackUrl) {
    return;
  }

  bucket.fallbackUrl = normalizeMemberUrl(entity);
};

const buildNamespaceBuckets = (entities: ApiEntity[]): NamespaceBuckets => {
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

function SidebarBadge({
  kind,
}: {
  kind: "C" | "I" | "S" | "E" | "M" | "P" | "A";
}) {
  const color =
    {
      C: "#3fb950", // green for class
      I: "#4a85f0", // blue for interface
      S: "#d29922", // orange for struct
      E: "#c96342", // brown for enum
      P: "#a371f7", // purple for property
      M: "#2A6FDB", // light blue for method
      A: "#db4b96", // red for attribute/event
    }[kind] || "var(--text-faint)";

  return (
    <span
      style={{
        alignItems: "center",
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
        borderRadius: 4,
        color: color,
        display: "inline-flex",
        flexShrink: 0,
        fontFamily: "var(--font-mono, monospace)",
        fontSize: "8.5px",
        fontWeight: 700,
        height: "15px",
        justifyContent: "center",
        lineHeight: 1,
        marginRight: "6px",
        width: "15px",
      }}
    >
      {kind}
    </span>
  );
}

const getTypeKind = (entity: ApiEntity | null): "C" | "I" | "S" | "E" => {
  if (!entity) {
    return "C";
  }
  if (entity.entityKind === "interface") {
    return "I";
  }
  if (entity.entityKind === "struct") {
    return "S";
  }
  if (entity.entityKind === "enum") {
    return "E";
  }
  return "C";
};

const getMemberKind = (entity: ApiEntity): "M" | "P" => {
  if (entity.type === "property") {
    return "P";
  }
  return "M";
};

const getMemberName = (entity: ApiEntity): string => {
  if (entity.type === "property") {
    return entity.name;
  }
  return `${entity.name}()`;
};

const buildMemberMap = (entities: ApiEntity[]): Map<string, ApiEntity[]> => {
  const map = new Map<string, ApiEntity[]>();
  for (const entity of entities) {
    if (entity.type === "method" || entity.type === "property") {
      const list = map.get(entity.class) ?? [];
      list.push(entity);
      map.set(entity.class, list);
    }
  }
  return map;
};

const toTypeNode = (
  className: string,
  bucket: TypeBucket,
  memberMap: Map<string, ApiEntity[]>
): Node | null => {
  const typeUrl = bucket.typeEntity?.url ?? bucket.fallbackUrl;

  if (!typeUrl) {
    return null;
  }

  const label = toTypeLabel(className, bucket);
  const kind = getTypeKind(bucket.typeEntity);
  const typeBadge = <SidebarBadge kind={kind} />;

  // Get members belonging to this class
  const members = memberMap.get(className) ?? [];

  if (members.length === 0) {
    return {
      icon: typeBadge,
      name: label,
      type: "page",
      url: typeUrl,
    };
  }

  // Group & sort members
  const sortedMembers = members.toSorted((left, right) => {
    // 1. Group by type: properties first, then methods (incl. constructors)
    const leftWeight = left.type === "property" ? 1 : 2;
    const rightWeight = right.type === "property" ? 1 : 2;

    if (leftWeight !== rightWeight) {
      return leftWeight - rightWeight;
    }

    // 2. Alphabetical by name
    return compareText(left.name, right.name);
  });

  const memberNodes = memberNodesMapper(sortedMembers, typeUrl);

  return {
    children: memberNodes,
    collapsible: true,
    defaultOpen: false,
    icon: typeBadge,
    index: {
      icon: typeBadge,
      name: label,
      type: "page" as const,
      url: typeUrl,
    },
    name: label,
    type: "folder" as const,
  };
};

function memberNodesMapper(
  sortedMembers: ApiEntity[],
  typeUrl: string
): Node[] {
  return sortedMembers.map((member) => {
    const memberKind = getMemberKind(member);
    const memberName = getMemberName(member);
    const anchor = buildApiEntityAnchor(member);
    return {
      icon: <SidebarBadge kind={memberKind} />,
      name: memberName,
      type: "page" as const,
      url: `${typeUrl}#${anchor}`,
    };
  });
}

const toNamespaceFolders = (
  namespaces: NamespaceBuckets,
  memberMap: Map<string, ApiEntity[]>
): Folder[] =>
  [...namespaces.entries()]
    .toSorted((left, right) => compareText(left[0], right[0]))
    .flatMap(([namespaceName, typeBuckets]) => {
      const typeNodes = [...typeBuckets.entries()]
        .toSorted((left, right) => compareText(left[0], right[0]))
        .flatMap(([className, bucket]) => {
          const node = toTypeNode(className, bucket, memberMap);
          return node ? [node] : [];
        });

      if (typeNodes.length === 0) {
        return [];
      }

      return [
        {
          children: typeNodes,
          collapsible: true,
          defaultOpen: false,
          name: namespaceName,
          type: "folder" as const,
        },
      ];
    });

const buildApiReferenceFolder = async (): Promise<Folder> => {
  const entities = await loadApiEntities();
  const namespaces = buildNamespaceBuckets(entities);
  const memberMap = buildMemberMap(entities);

  return {
    children: toNamespaceFolders(namespaces, memberMap),
    collapsible: true,
    defaultOpen: false,
    index: {
      name: "API Reference",
      type: "page",
      url: API_ROOT_URL,
    },
    name: API_FOLDER_NAME,
    type: "folder",
  };
};

const getApiReferenceFolder = unstable_cache(
  buildApiReferenceFolder,
  [API_ENTITIES_CACHE_TAG],
  { tags: [API_ENTITIES_CACHE_TAG] }
);

const getOfficialDocsFolder = (): Promise<Folder> =>
  getOfficialDocsSectionTree();

const getTutorialDocsFolder = (): Promise<Folder> =>
  getTutorialDocsSectionTree();

const isApiFolder = (node: Root["children"][number]): boolean =>
  node.type === "folder" &&
  (node.index?.url === API_ROOT_URL || node.name === API_FOLDER_NAME);

const isOfficialDocsFolder = (node: Root["children"][number]): boolean =>
  node.type === "folder" &&
  (node.index?.url === OFFICIAL_DOCS_FOLDER_URL ||
    node.name === OFFICIAL_DOCS_FOLDER_NAME);

const isTutorialDocsFolder = (node: Root["children"][number]): boolean =>
  node.type === "folder" &&
  (node.index?.url === TUTORIAL_DOCS_FOLDER_URL ||
    node.name === TUTORIAL_DOCS_FOLDER_NAME);

const isGetStartedPage = (node: Root["children"][number]): boolean => {
  if (node.type === "page") {
    return node.url === GET_STARTED_URL;
  }

  if (node.type === "folder") {
    return node.index?.url === GET_STARTED_URL;
  }

  return false;
};

export const mergeDocsTree = async (baseTree: Root): Promise<Root> => {
  const officialDocsFolder = await getOfficialDocsFolder();
  const tutorialDocsFolder = await getTutorialDocsFolder();
  const apiFolder = await getApiReferenceFolder();

  const nonManagedNodes = baseTree.children.filter(
    (node) =>
      !isApiFolder(node) &&
      !isOfficialDocsFolder(node) &&
      !isTutorialDocsFolder(node)
  );
  const reorderedNonApiNodes = [
    ...nonManagedNodes.filter(isGetStartedPage),
    ...nonManagedNodes.filter((node) => !isGetStartedPage(node)),
  ];

  return {
    ...baseTree,
    children: [
      ...reorderedNonApiNodes,
      officialDocsFolder,
      tutorialDocsFolder,
      apiFolder,
    ],
  };
};
