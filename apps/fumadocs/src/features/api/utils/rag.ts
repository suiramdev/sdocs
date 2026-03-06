import { generateText } from "ai";

import { getRagLanguageModel } from "@/features/api/utils/ai-provider";
import { executeSearchApiTool } from "@/features/api/utils/tool-search-api";

interface AnswerApiQuestionInput {
  question: string;
  limit?: number;
}

interface RagCitation {
  id: string;
  name: string;
  signature: string;
  url: string;
}

export interface RagAnswer {
  question: string;
  answer: string;
  grounded: boolean;
  needsRefinement: boolean;
  refinementPrompt?: string;
  retrieval: {
    query: string;
    total: number;
    entities: RagCitation[];
  };
}

const isAmbiguous = (scores: (number | undefined)[]): boolean => {
  if (scores.length < 2) {
    return false;
  }

  const [first, second] = scores;
  if (first === undefined || second === undefined) {
    return false;
  }

  return Math.abs(first - second) < 0.03;
};

const formatGroundingContext = (citations: RagCitation[]): string =>
  citations
    .map(
      (citation, index) =>
        `${index + 1}. ${citation.name}\nSignature: ${citation.signature}\nURL: ${citation.url}`
    )
    .join("\n\n");

const generateWithProvider = async (
  question: string,
  context: string
): Promise<string | null> => {
  const model = getRagLanguageModel();
  if (!model) {
    return null;
  }

  try {
    const { text } = await generateText({
      model,
      prompt: `Question:\n${question}\n\nRetrieved API entities:\n${context}`,
      system:
        "You are an API assistant. Answer only using retrieved API entities. Never invent methods, namespaces, or signatures. Quote signatures exactly as provided. If evidence is insufficient, explicitly ask for a refined query.",
      temperature: 0,
    });

    return text.trim() || null;
  } catch {
    return null;
  }
};

const generateFallbackAnswer = (
  question: string,
  citations: RagCitation[]
): string => {
  const intro = `Grounded results for: ${question}`;
  const lines = citations.map(
    (citation, index) =>
      `${index + 1}. ${citation.name} \`${citation.signature}\` -> ${citation.url}`
  );

  return [intro, ...lines].join("\n");
};

export const answerApiQuestion = async (
  input: AnswerApiQuestionInput
): Promise<RagAnswer> => {
  const retrieval = await executeSearchApiTool({
    limit: input.limit ?? 6,
    query: input.question,
  });

  const citations = retrieval.entities.slice(0, 6).map((entity) => ({
    id: entity.id,
    name: entity.name,
    signature: entity.signature,
    url: entity.url,
  }));

  if (citations.length === 0) {
    return {
      answer:
        "No API entities matched this question. Provide a class, method, or namespace keyword to refine search.",
      grounded: true,
      needsRefinement: true,
      question: input.question,
      refinementPrompt:
        "Try adding a namespace, class name, or expected return type so search can resolve the exact API entity.",
      retrieval: {
        entities: citations,
        query: retrieval.query,
        total: retrieval.total,
      },
    };
  }

  const ambiguous = isAmbiguous(
    retrieval.entities.slice(0, 2).map((entity) => entity.score)
  );
  if (ambiguous) {
    return {
      answer:
        "Multiple API entities match with near-identical ranking. Refine the query with namespace or full type/method name.",
      grounded: true,
      needsRefinement: true,
      question: input.question,
      refinementPrompt:
        "Include the declaring class and expected parameter types (for example: Namespace.Class.Method(TypeA, TypeB)).",
      retrieval: {
        entities: citations,
        query: retrieval.query,
        total: retrieval.total,
      },
    };
  }

  const context = formatGroundingContext(citations);
  const aiAnswer = await generateWithProvider(input.question, context);

  return {
    answer: aiAnswer ?? generateFallbackAnswer(input.question, citations),
    grounded: true,
    needsRefinement: false,
    question: input.question,
    retrieval: {
      entities: citations,
      query: retrieval.query,
      total: retrieval.total,
    },
  };
};
