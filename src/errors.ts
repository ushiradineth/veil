export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isAbortLike(aborted: boolean, message: string): boolean {
  const lower = message.toLowerCase();
  return (
    aborted ||
    message.includes("AbortError") ||
    lower.includes("aborted") ||
    lower.includes("timeout")
  );
}
