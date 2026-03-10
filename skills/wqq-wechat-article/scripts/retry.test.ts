import { describe, it, expect } from "bun:test";
import { retryWithBackoff, formatError } from "./retry";

describe("retry utilities", () => {
  it("should succeed on first attempt", async () => {
    let attempts = 0;
    const result = await retryWithBackoff(async () => {
      attempts++;
      return "success";
    });

    expect(result).toBe("success");
    expect(attempts).toBe(1);
  });

  it("should retry on failure and eventually succeed", async () => {
    let attempts = 0;
    const result = await retryWithBackoff(
      async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error("temporary failure");
        }
        return "success";
      },
      { maxAttempts: 3, delayMs: 10 }
    );

    expect(result).toBe("success");
    expect(attempts).toBe(3);
  });

  it("should throw after max attempts", async () => {
    let attempts = 0;

    try {
      await retryWithBackoff(
        async () => {
          attempts++;
          throw new Error("persistent failure");
        },
        { maxAttempts: 2, delayMs: 10 }
      );
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("persistent failure");
      expect(attempts).toBe(2);
    }
  });

  it("should call onRetry callback", async () => {
    const retryErrors: Error[] = [];
    const retryAttempts: number[] = [];

    try {
      await retryWithBackoff(
        async () => {
          throw new Error("test error");
        },
        {
          maxAttempts: 3,
          delayMs: 10,
          onRetry: (error, attempt) => {
            retryErrors.push(error);
            retryAttempts.push(attempt);
          },
        }
      );
    } catch {
      // Expected to fail
    }

    expect(retryErrors.length).toBe(2); // 2 retries before final failure
    expect(retryAttempts).toEqual([1, 2]);
    expect(retryErrors[0]?.message).toBe("test error");
  });
});

describe("formatError", () => {
  it("should format Error objects", () => {
    const error = new Error("test error");
    expect(formatError(error)).toBe("test error");
  });

  it("should format string errors", () => {
    expect(formatError("string error")).toBe("string error");
  });

  it("should format other types", () => {
    expect(formatError(123)).toBe("123");
    expect(formatError(null)).toBe("null");
  });
});
