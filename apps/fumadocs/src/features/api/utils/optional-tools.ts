import {
  describeApiEntityService,
  getSignatureService,
} from "@/features/api/utils/service";

export const apiDescribeTool = {
  description: "Fetch full metadata for a specific indexed API entity id.",
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
  name: "api_describe_entity",
} as const;

export const apiSignatureTool = {
  description: "Return the exact API signature for an entity id.",
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
  name: "api_get_signature",
} as const;

export async function executeDescribeTool(input: { id: string }) {
  return describeApiEntityService(input);
}

export async function executeSignatureTool(input: { id: string }) {
  return getSignatureService(input);
}
