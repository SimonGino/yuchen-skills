import { describe, it, expect } from "bun:test";
import { fetchFxtweet } from "./fxtwitter";

describe("fetchFxtweet", () => {
  it("should throw for non-200 response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("", { status: 500 })) as any;
    try {
      await expect(fetchFxtweet("123")).rejects.toThrow("fxtwitter API error (500)");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should throw when tweet is null in response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ code: 404, message: "Not Found", tweet: null }), { status: 200 })) as any;
    try {
      await expect(fetchFxtweet("123")).rejects.toThrow("Tweet not found: Not Found");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should return tweet data for valid response", async () => {
    const tweetData = {
      id: "123",
      text: "hello",
      url: "https://x.com/user/status/123",
      author: { name: "Test", screen_name: "test" },
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ code: 200, message: "OK", tweet: tweetData }), { status: 200 })) as any;
    try {
      const result = await fetchFxtweet("123");
      expect(result.id).toBe("123");
      expect(result.text).toBe("hello");
      expect(result.author.screen_name).toBe("test");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
