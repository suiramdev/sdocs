import type { SdkEntity } from "@/lib/sdk/schemas";

function hashText(value: string): string {
  let hash = 0;

  for (const char of value) {
    hash = Math.trunc((hash * 31 + (char.codePointAt(0) ?? 0)) % 2_147_483_647);
  }

  return Math.abs(hash).toString(36);
}

export function safeAnchorSegment(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "");

  return cleaned.length > 0 ? cleaned : "section";
}

export function buildSdkEntityAnchor(
  entity: Pick<SdkEntity, "anchor" | "class" | "entityKind" | "id" | "name">
): string {
  if (entity.anchor && entity.anchor.length > 0) {
    return entity.anchor;
  }

  const nameBase =
    entity.entityKind === "constructor"
      ? `${entity.class.split(".").at(-1) ?? entity.class}-ctor`
      : entity.name;

  return `${safeAnchorSegment(nameBase)}-${hashText(entity.id).slice(0, 6)}`;
}
