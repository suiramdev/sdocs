import type { Folder, Root } from "fumadocs-core/page-tree";

import { loadSdkEntities } from "@/lib/sdk/data";
import { buildSdkEntityAnchor } from "@/lib/sdk/reference";
import type { SdkEntity } from "@/lib/sdk/schemas";

type MethodEntity = SdkEntity & { type: "method" };
type PropertyEntity = SdkEntity & { type: "property" };
type TypeEntity = SdkEntity & { type: "class" | "enum" };

interface TypeBucket {
  constructors: MethodEntity[];
  methods: MethodEntity[];
  properties: PropertyEntity[];
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

const isTypeEntity = (entity: SdkEntity): entity is TypeEntity =>
  entity.type === "class" || entity.type === "enum";

const compareText = (left: string, right: string): number =>
  left.localeCompare(right);

const compareEntities = (left: SdkEntity, right: SdkEntity): number => {
  const nameCompare = compareText(left.name, right.name);
  if (nameCompare !== 0) {
    return nameCompare;
  }

  return compareText(left.signature, right.signature);
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

const getOrCreateTypeBucket = (
  namespaces: NamespaceBuckets,
  namespaceName: string,
  className: string
): TypeBucket => {
  const typeBuckets = getOrCreate(namespaces, namespaceName, () => new Map());

  return getOrCreate(typeBuckets, className, () => ({
    constructors: [],
    methods: [],
    properties: [],
    typeEntity: null,
  }));
};

const buildNamespaceBuckets = (entities: SdkEntity[]): NamespaceBuckets => {
  const namespaces: NamespaceBuckets = new Map();

  for (const entity of entities) {
    const bucket = getOrCreateTypeBucket(
      namespaces,
      entity.namespace,
      entity.class
    );

    if (isTypeEntity(entity)) {
      bucket.typeEntity = entity;
      continue;
    }

    if (isMethodEntity(entity)) {
      if (entity.entityKind === "constructor") {
        bucket.constructors.push(entity);
      } else {
        bucket.methods.push(entity);
      }
      continue;
    }

    if (isPropertyEntity(entity)) {
      bucket.properties.push(entity);
    }
  }

  return namespaces;
};

function deriveTypeUrl(bucket: TypeBucket): string | null {
  if (bucket.typeEntity) {
    return bucket.typeEntity.url;
  }

  const fallbackMember =
    bucket.constructors[0] ?? bucket.methods[0] ?? bucket.properties[0];

  if (!fallbackMember) {
    return null;
  }

  if (fallbackMember.canonicalUrl && fallbackMember.canonicalUrl.length > 0) {
    return fallbackMember.canonicalUrl;
  }

  return fallbackMember.url.replace(/\/(methods|properties)\/[^/]+$/u, "");
}

function toMemberUrl(
  member: MethodEntity | PropertyEntity,
  typeUrl: string
): string {
  const canonicalUrl = member.canonicalUrl || typeUrl;
  return `${canonicalUrl}#${buildSdkEntityAnchor(member)}`;
}

function toMemberNodes(
  members: (MethodEntity | PropertyEntity)[],
  typeUrl: string
): (
  | {
      name: string;
      type: "page";
      url: string;
    }
  | Folder
)[] {
  const sorted = members.toSorted(compareEntities);
  const grouped = new Map<string, (MethodEntity | PropertyEntity)[]>();

  for (const member of sorted) {
    const groupName =
      member.type === "method" && member.entityKind === "constructor"
        ? ".ctor"
        : member.name;
    const bucket = grouped.get(groupName) ?? [];
    bucket.push(member);
    grouped.set(groupName, bucket);
  }

  const nodes: (
    | {
        name: string;
        type: "page";
        url: string;
      }
    | Folder
  )[] = [];

  for (const [groupName, groupMembers] of [...grouped.entries()].toSorted(
    (left, right) => compareText(left[0], right[0])
  )) {
    if (groupMembers.length === 1) {
      const [single] = groupMembers;
      if (!single) {
        continue;
      }

      nodes.push({
        name: single.displaySignature,
        type: "page",
        url: toMemberUrl(single, typeUrl),
      });
      continue;
    }

    const title =
      groupName === ".ctor"
        ? `Constructors (${groupMembers.length})`
        : `${groupName} (${groupMembers.length})`;

    nodes.push({
      children: groupMembers.map((member) => ({
        name: member.displaySignature,
        type: "page" as const,
        url: toMemberUrl(member, typeUrl),
      })),
      collapsible: true,
      defaultOpen: false,
      name: title,
      type: "folder",
    });
  }

  return nodes;
}

function toTypeFolder(className: string, bucket: TypeBucket): Folder | null {
  const typeUrl = deriveTypeUrl(bucket);

  if (!typeUrl) {
    return null;
  }

  const constructors = toMemberNodes(bucket.constructors, typeUrl);
  const methods = toMemberNodes(bucket.methods, typeUrl);
  const properties = toMemberNodes(bucket.properties, typeUrl);

  const memberFolders: Folder[] = [];

  if (constructors.length > 0) {
    memberFolders.push({
      children: constructors,
      collapsible: true,
      defaultOpen: false,
      name: "Constructors",
      type: "folder",
    });
  }

  if (methods.length > 0) {
    memberFolders.push({
      children: methods,
      collapsible: true,
      defaultOpen: false,
      name: "Methods",
      type: "folder",
    });
  }

  if (properties.length > 0) {
    memberFolders.push({
      children: properties,
      collapsible: true,
      defaultOpen: false,
      name: "Properties",
      type: "folder",
    });
  }

  const typeName =
    bucket.typeEntity?.name ?? className.split(".").at(-1) ?? className;
  const typeLabel = bucket.typeEntity
    ? `${typeName} (${bucket.typeEntity.entityKind})`
    : typeName;

  return {
    children: memberFolders,
    collapsible: true,
    defaultOpen: false,
    index: {
      name: typeLabel,
      type: "page",
      url: typeUrl,
    },
    name: typeLabel,
    type: "folder",
  };
}

function toNamespaceFolders(namespaces: NamespaceBuckets): Folder[] {
  return [...namespaces.entries()]
    .toSorted((left, right) => compareText(left[0], right[0]))
    .flatMap(([namespaceName, typeBuckets]) => {
      const typeFolders = [...typeBuckets.entries()]
        .toSorted((left, right) => compareText(left[0], right[0]))
        .flatMap(([className, bucket]) => {
          const folder = toTypeFolder(className, bucket);
          return folder ? [folder] : [];
        });

      if (typeFolders.length === 0) {
        return [];
      }

      return [
        {
          children: typeFolders,
          collapsible: true,
          defaultOpen: false,
          name: namespaceName,
          type: "folder" as const,
        },
      ];
    });
}

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
