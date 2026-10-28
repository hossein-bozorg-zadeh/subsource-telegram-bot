/** An error whose message is safe and useful to show to a Telegram user. */
export class UserFacingError extends Error {
  readonly userMessage: string;

  constructor(userMessage: string, options?: { cause?: unknown; internalMessage?: string }) {
    super(options?.internalMessage ?? userMessage, { cause: options?.cause });
    this.name = "UserFacingError";
    this.userMessage = userMessage;
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function errorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}
