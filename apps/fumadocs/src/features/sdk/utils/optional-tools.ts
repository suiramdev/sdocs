import {
  describeSdkEntityService,
  getSignatureService,
} from "@/features/sdk/utils/service";

export const sdkDescribeTool = {
  description: "Fetch full metadata for a specific indexed SDK entity id.",
  input_schema: {
    additionalProperties: false,
    properties: {
      id: {
        description: "Entity id from search results.",
        type: "string",
      },
    },
    required: ["id"],
    type: "object",
  },
  name: "sdk_describe_entity",
} as const;

export const sdkSignatureTool = {
  description: "Return the exact SDK signature for an entity id.",
  input_schema: {
    additionalProperties: false,
    properties: {
      id: {
        description: "Entity id from search results.",
        type: "string",
      },
    },
    required: ["id"],
    type: "object",
  },
  name: "sdk_get_signature",
} as const;

export async function executeDescribeTool(input: { id: string }) {
  return describeSdkEntityService(input);
}

export async function executeSignatureTool(input: { id: string }) {
  return getSignatureService(input);
}
