import { describe, expect, test } from "bun:test";
import { buildGraphqlRetryOptions, resolveTweetQueryChunkUrl } from "./graphql";
import { HttpStatusError } from "./http";

describe("resolveTweetQueryChunkUrl", () => {
  test("uses main chunk when available", () => {
    const html = 'https://abs.twimg.com/responsive-web/client-web/main.abc123.js';
    expect(resolveTweetQueryChunkUrl(html)).toBe(
      "https://abs.twimg.com/responsive-web/client-web/main.abc123.js"
    );
  });

  test("falls back to api chunk when main chunk is missing", () => {
    const html = '"api":"z9_y-X"';
    expect(resolveTweetQueryChunkUrl(html)).toBe(
      "https://abs.twimg.com/responsive-web/client-web/api.z9_y-Xa.js"
    );
  });
});

describe("buildGraphqlRetryOptions", () => {
  test("uses the caller-provided retry config", () => {
    const options = buildGraphqlRetryOptions({
      maxAttempts: 4,
      delayMs: 15_000,
      backoffFactor: 3,
    });

    expect(options.maxAttempts).toBe(4);
    expect(options.delayMs).toBe(15_000);
    expect(options.backoffFactor).toBe(3);
  });

  test("prefers retryAfterMs when rate-limit metadata is available", () => {
    const options = buildGraphqlRetryOptions({
      maxAttempts: 5,
      delayMs: 60_000,
      backoffFactor: 2,
    });

    const error = new HttpStatusError(429, "rate limited", 1_234);
    expect(options.getDelay?.(error, 1, 5_000)).toBe(1_234);
  });
});
