import { access, readFile } from "node:fs/promises";

import { sdkConfig } from "@/lib/sdk/config";
import { sdkEntitySchema } from "@/lib/sdk/schemas";
import type { SdkEntity } from "@/lib/sdk/schemas";

let entityCache: SdkEntity[] | null = null;
let entityByIdCache: Map<string, SdkEntity> | null = null;
let entityByUrlCache: Map<string, SdkEntity> | null = null;
let entitiesByClassCache: Map<string, SdkEntity[]> | null = null;
let typeByClassCache: Map<string, SdkEntity> | null = null;

function toClassKey(namespace: string, className: string): string {
  return `${namespace}::${className}`;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function buildCaches(): Promise<void> {
  if (entityCache) {
    return;
  }

  if (!(await fileExists(sdkConfig.data.entitiesFile))) {
    entityCache = [];
    entityByIdCache = new Map();
    entityByUrlCache = new Map();
    entitiesByClassCache = new Map();
    typeByClassCache = new Map();
    return;
  }

  const raw = await readFile(sdkConfig.data.entitiesFile, "utf8");
  const parsedJson = JSON.parse(raw) as unknown;

  if (!Array.isArray(parsedJson)) {
    throw new TypeError(
      `SDK entity file ${sdkConfig.data.entitiesFile} is not an array`
    );
  }

  const entities = parsedJson.map((item) => sdkEntitySchema.parse(item));
  const byId = new Map<string, SdkEntity>();
  const byUrl = new Map<string, SdkEntity>();
  const byClass = new Map<string, SdkEntity[]>();
  const typeByClass = new Map<string, SdkEntity>();

  for (const entity of entities) {
    byId.set(entity.id, entity);
    byUrl.set(entity.url, entity);

    const key = toClassKey(entity.namespace, entity.class);
    const classEntities = byClass.get(key) ?? [];
    classEntities.push(entity);
    byClass.set(key, classEntities);

    if (entity.type === "class" || entity.type === "enum") {
      typeByClass.set(key, entity);
    }
  }

  entityCache = entities;
  entityByIdCache = byId;
  entityByUrlCache = byUrl;
  entitiesByClassCache = byClass;
  typeByClassCache = typeByClass;
}

export async function loadSdkEntities(): Promise<SdkEntity[]> {
  await buildCaches();
  return entityCache ?? [];
}

export async function getEntityById(id: string): Promise<SdkEntity | null> {
  await buildCaches();
  return entityByIdCache?.get(id) ?? null;
}

export async function getEntityByUrl(url: string): Promise<SdkEntity | null> {
  await buildCaches();
  return entityByUrlCache?.get(url) ?? null;
}

export async function getEntitiesByClass(
  namespace: string,
  className: string
): Promise<SdkEntity[]> {
  await buildCaches();
  return entitiesByClassCache?.get(toClassKey(namespace, className)) ?? [];
}

export async function getTypeEntityByClass(
  namespace: string,
  className: string
): Promise<SdkEntity | null> {
  await buildCaches();
  return typeByClassCache?.get(toClassKey(namespace, className)) ?? null;
}
