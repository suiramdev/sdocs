import { answerApiQuestion } from "@/features/api/utils/rag";
import {
  describeApiEntityService,
  getSignatureService,
  searchApiService,
} from "@/features/api/utils/service";
import { ApiV1Error } from "@/features/api/v1/domain/errors";
import type { SearchApiBodyInput } from "@/features/api/v1/domain/schemas";

export const searchApiReference = (input: SearchApiBodyInput) =>
  searchApiService(input);

export const getApiEntityById = async (id: string) => {
  const result = await describeApiEntityService({ id });
  if (!result.entity) {
    throw new ApiV1Error({
      code: "NOT_FOUND",
      details: { id },
      message: "Entity not found",
      status: 404,
    });
  }

  return result;
};

export const getApiSignatureById = async (id: string) => {
  const result = await getSignatureService({ id });
  if (!result.signature) {
    throw new ApiV1Error({
      code: "NOT_FOUND",
      details: { id },
      message: "Signature not found",
      status: 404,
    });
  }

  return result;
};

export const askApiReferenceQuestion = (input: {
  question: string;
  limit?: number;
}) => answerApiQuestion(input);
