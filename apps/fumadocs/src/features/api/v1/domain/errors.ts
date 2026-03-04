export type ApiV1ErrorCode =
  | "INTERNAL_ERROR"
  | "INVALID_INPUT"
  | "METHOD_NOT_ALLOWED"
  | "NOT_FOUND"
  | "TOOL_NOT_FOUND";

interface ApiV1ErrorInput {
  code: ApiV1ErrorCode;
  message: string;
  details?: unknown;
  status: number;
}

export class ApiV1Error extends Error {
  readonly code: ApiV1ErrorCode;
  readonly details?: unknown;
  readonly status: number;

  constructor(input: ApiV1ErrorInput) {
    super(input.message);
    this.name = "ApiV1Error";
    this.code = input.code;
    this.details = input.details;
    this.status = input.status;
  }
}
