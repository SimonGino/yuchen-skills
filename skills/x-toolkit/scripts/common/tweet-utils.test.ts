import { describe, it, expect } from "bun:test";
import {
  unwrapTweetResult,
  pickTweetText,
  pickUsername,
  pickMediaUrls,
  formatMetaMarkdown,
  expandTcoUrls,
} from "./tweet-utils";

describe("unwrapTweetResult", () => {
  it("should return null for falsy input", () => {
    expect(unwrapTweetResult(null)).toBeNull();
    expect(unwrapTweetResult(undefined)).toBeNull();
  });

  it("should unwrap TweetWithVisibilityResults", () => {
    const result = {
      __typename: "TweetWithVisibilityResults",
      tweet: { rest_id: "123" },
    };
    expect(unwrapTweetResult(result)).toEqual({ rest_id: "123" });
  });

  it("should unwrap .tweet property as fallback", () => {
    const result = { tweet: { rest_id: "456" } };
    expect(unwrapTweetResult(result)).toEqual({ rest_id: "456" });
  });

  it("should return result as-is when no .tweet property", () => {
    const result = { rest_id: "789" };
    expect(unwrapTweetResult(result)).toEqual({ rest_id: "789" });
  });
});

describe("expandTcoUrls", () => {
  it("should expand t.co URLs using legacy entities", () => {
    const text = "Check https://t.co/abc123";
    const tweet = {
      legacy: {
        entities: {
          urls: [{ url: "https://t.co/abc123", expanded_url: "https://example.com/full" }],
        },
      },
    };
    expect(expandTcoUrls(text, tweet)).toBe("Check https://example.com/full");
  });

  it("should return text unchanged when no urls", () => {
    expect(expandTcoUrls("hello", {})).toBe("hello");
    expect(expandTcoUrls("hello", null)).toBe("hello");
  });
});

describe("pickTweetText", () => {
  it("should prefer note_tweet text", () => {
    const tweet = {
      note_tweet: { note_tweet_results: { result: { text: "note text" } } },
      legacy: { full_text: "legacy text" },
    };
    expect(pickTweetText(tweet)).toBe("note text");
  });

  it("should fall back to legacy full_text", () => {
    const tweet = { legacy: { full_text: "legacy text" } };
    expect(pickTweetText(tweet)).toBe("legacy text");
  });

  it("should expand t.co URLs in the result", () => {
    const tweet = {
      legacy: {
        full_text: "See https://t.co/x",
        entities: { urls: [{ url: "https://t.co/x", expanded_url: "https://real.com" }] },
      },
    };
    expect(pickTweetText(tweet)).toBe("See https://real.com");
  });

  it("should return empty string for null tweet", () => {
    expect(pickTweetText(null)).toBe("");
  });
});

describe("pickUsername", () => {
  it("should extract screen_name from core.user_results", () => {
    const tweet = { core: { user_results: { result: { legacy: { screen_name: "alice" } } } } };
    expect(pickUsername(tweet)).toBe("alice");
  });

  it("should return null when missing", () => {
    expect(pickUsername({})).toBeNull();
    expect(pickUsername(null)).toBeNull();
  });
});

describe("pickMediaUrls", () => {
  it("should extract photo URLs", () => {
    const tweet = {
      legacy: {
        extended_entities: {
          media: [{ type: "photo", media_url_https: "https://pbs.twimg.com/img.jpg" }],
        },
      },
    };
    expect(pickMediaUrls(tweet)).toEqual(["https://pbs.twimg.com/img.jpg"]);
  });

  it("should extract best video URL by bitrate", () => {
    const tweet = {
      legacy: {
        extended_entities: {
          media: [{
            type: "video",
            video_info: {
              variants: [
                { url: "https://v.com/low.mp4", content_type: "video/mp4", bitrate: 100 },
                { url: "https://v.com/high.mp4", content_type: "video/mp4", bitrate: 2000 },
              ],
            },
          }],
        },
      },
    };
    expect(pickMediaUrls(tweet)).toEqual(["https://v.com/high.mp4"]);
  });

  it("should return empty array for null tweet", () => {
    expect(pickMediaUrls(null)).toEqual([]);
  });
});

describe("formatMetaMarkdown", () => {
  it("should format frontmatter with string and number values", () => {
    const result = formatMetaMarkdown({ url: "https://x.com/test", count: 5 });
    expect(result).toBe('---\nurl: "https://x.com/test"\ncount: 5\n---');
  });

  it("should skip null, undefined, and empty string values", () => {
    const result = formatMetaMarkdown({ a: "ok", b: null, c: undefined, d: "" });
    expect(result).toBe('---\na: "ok"\n---');
  });
});
