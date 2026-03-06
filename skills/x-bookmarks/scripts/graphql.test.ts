import { describe, expect, test } from "bun:test";
import { resolveTweetQueryChunkUrl } from "./graphql";

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
