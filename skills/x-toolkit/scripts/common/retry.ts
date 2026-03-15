// Retry utilities with exponential backoff

export type RetryOptions = {
  maxAttempts?: number;
  delayMs?: number;
  backoffFactor?: number;
  onRetry?: (error: Error, attempt: number) => void;
  isRetryable?: (error: Error) => boolean;
  getDelay?: (error: Error, attempt: number, defaultDelay: number) => number;
};

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    delayMs = 1000,
    backoffFactor = 2,
    onRetry,
    isRetryable,
    getDelay,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (isRetryable && !isRetryable(lastError)) {
        throw lastError;
      }

      if (attempt === maxAttempts) {
        break;
      }

      if (onRetry) {
        onRetry(lastError, attempt);
      }

      // Exponential backoff, or custom delay from error (e.g. rate limit reset)
      const defaultDelay = delayMs * Math.pow(backoffFactor, attempt - 1);
      const delay = getDelay ? getDelay(lastError, attempt, defaultDelay) : defaultDelay;
      await sleep(delay);
    }
  }

  throw lastError;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function sleepWithJitter(baseMs: number, jitterMs: number): Promise<void> {
  const delay = baseMs + Math.random() * jitterMs;
  return sleep(delay);
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
