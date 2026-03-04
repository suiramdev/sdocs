import { access, readFile } from "node:fs/promises";

import { apiConfig } from "@/features/api/utils/config";
import { apiEntitySchema } from "@/features/api/utils/schemas";
import type { ApiEntity } from "@/features/api/utils/schemas";

let entityCache: ApiEntity[] | null = null;
let entityByIdCache: Map<string, ApiEntity> | null = null;
let entityByUrlCache: Map<string, ApiEntity> | null = null;
let entitiesByClassCache: Map<string, ApiEntity[]> | null = null;
let typeByClassCache: Map<string, ApiEntity> | null = null;

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

  if (!(await fileExists(apiConfig.data.entitiesFile))) {
    entityCache = [];
    entityByIdCache = new Map();
    entityByUrlCache = new Map();
    entitiesByClassCache = new Map();
    typeByClassCache = new Map();
    return;
  }

  const raw = await readFile(apiConfig.data.entitiesFile, "utf8");
  const parsedJson = JSON.parse(raw) as unknown;

  if (!Array.isArray(parsedJson)) {
    throw new TypeError(
      `API entity file ${apiConfig.data.entitiesFile} is not an array`
    );
  }

  const entities = parsedJson.map((item) => apiEntitySchema.parse(item));
  const byId = new Map<string, ApiEntity>();
  const byUrl = new Map<string, ApiEntity>();
  const byClass = new Map<string, ApiEntity[]>();
  const typeByClass = new Map<string, ApiEntity>();

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

export async function loadApiEntities(): Promise<ApiEntity[]> {
  await buildCaches();
  return entityCache ?? [];
}

export async function getEntityById(id: string): Promise<ApiEntity | null> {
  await buildCaches();
  return entityByIdCache?.get(id) ?? null;
}

export async function getEntityByUrl(url: string): Promise<ApiEntity | null> {
  await buildCaches();
  return entityByUrlCache?.get(url) ?? null;
}

export async function getEntitiesByClass(
  namespace: string,
  className: string
): Promise<ApiEntity[]> {
  await buildCaches();
  return entitiesByClassCache?.get(toClassKey(namespace, className)) ?? [];
}

export async function getTypeEntityByClass(
  namespace: string,
  className: string
): Promise<ApiEntity | null> {
  await buildCaches();
  return typeByClassCache?.get(toClassKey(namespace, className)) ?? null;
}
