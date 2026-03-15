import { describe, it, expect } from "bun:test";
import { parseTweetId } from "./url-utils";

describe("parseTweetId", () => {
  it("should return bare numeric ID", () => {
    expect(parseTweetId("1234567890")).toBe("1234567890");
  });

  it("should extract ID from x.com URL", () => {
    expect(parseTweetId("https://x.com/user/status/1234567890")).toBe("1234567890");
  });

  it("should extract ID from twitter.com URL", () => {
    expect(parseTweetId("https://twitter.com/user/status/1234567890")).toBe("1234567890");
  });

  it("should handle /statuses/ path", () => {
    expect(parseTweetId("https://x.com/user/statuses/1234567890")).toBe("1234567890");
  });

  it("should return null for empty string", () => {
    expect(parseTweetId("")).toBeNull();
    expect(parseTweetId("  ")).toBeNull();
  });

  it("should return null for invalid URL", () => {
    expect(parseTweetId("not-a-url")).toBeNull();
  });
});
