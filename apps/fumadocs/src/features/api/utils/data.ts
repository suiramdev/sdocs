import { access, readFile } from "node:fs/promises";

import { apiConfig } from "@/features/api/utils/config";
import { apiEntitySchema } from "@/features/api/utils/schemas";
import type { ApiEntity } from "@/features/api/utils/schemas";

export const API_ENTITIES_REVALIDATE_PATH = "/docs/api";

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

async function loadApiEntitiesFromFile(): Promise<ApiEntity[]> {
  if (!(await fileExists(apiConfig.data.entitiesFile))) {
    return [];
  }

  const raw = await readFile(apiConfig.data.entitiesFile, "utf8");
  const parsedJson = JSON.parse(raw) as unknown;

  if (!Array.isArray(parsedJson)) {
    throw new TypeError(
      `API entity file ${apiConfig.data.entitiesFile} is not an array`
    );
  }

  return parsedJson.map((item) => apiEntitySchema.parse(item));
}

interface EntityCaches {
  entities: ApiEntity[];
  byId: Map<string, ApiEntity>;
  byUrl: Map<string, ApiEntity>;
  byClass: Map<string, ApiEntity[]>;
  typeByClass: Map<string, ApiEntity>;
}

let requestCache: EntityCaches | null = null;

async function getCaches(): Promise<EntityCaches> {
  if (requestCache) {
    return requestCache;
  }

  const entities = await loadApiEntitiesFromFile();
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

  requestCache = { byClass, byId, byUrl, entities, typeByClass };
  return requestCache;
}

export async function loadApiEntities(): Promise<ApiEntity[]> {
  return (await getCaches()).entities;
}

export async function getEntityById(id: string): Promise<ApiEntity | null> {
  return (await getCaches()).byId.get(id) ?? null;
}

export async function getEntityByUrl(url: string): Promise<ApiEntity | null> {
  return (await getCaches()).byUrl.get(url) ?? null;
}

export async function getEntitiesByClass(
  namespace: string,
  className: string
): Promise<ApiEntity[]> {
  return (
    (await getCaches()).byClass.get(toClassKey(namespace, className)) ?? []
  );
}

export async function getTypeEntityByClass(
  namespace: string,
  className: string
): Promise<ApiEntity | null> {
  return (
    (await getCaches()).typeByClass.get(toClassKey(namespace, className)) ??
    null
  );
}
