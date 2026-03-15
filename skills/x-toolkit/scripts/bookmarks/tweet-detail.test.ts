import { describe, expect, test } from "bun:test";
import { parseTweetResultPayload, resolveTweetQueryChunkUrl, shouldHydrateTweet } from "./tweet-detail";

describe("shouldHydrateTweet", () => {
  test("returns true when username is missing", () => {
    expect(
      shouldHydrateTweet({
        id: "1",
        username: null,
        text: "hello world",
        url: "https://x.com/i/web/status/1",
        mediaUrls: [],
      })
    ).toBe(true);
  });

  test("returns true when text is only t.co short link", () => {
    expect(
      shouldHydrateTweet({
        id: "1",
        username: "alice",
        text: "https://t.co/abc123",
        url: "https://x.com/alice/status/1",
        mediaUrls: [],
      })
    ).toBe(true);
  });

  test("returns false for complete tweet data", () => {
    expect(
      shouldHydrateTweet({
        id: "1",
        username: "alice",
        text: "this is a normal tweet body",
        url: "https://x.com/alice/status/1",
        mediaUrls: [],
      })
    ).toBe(false);
  });
});

describe("parseTweetResultPayload", () => {
  test("extracts username and expands t.co urls from tweet result payload", () => {
    const payload = {
      data: {
        tweetResult: {
          result: {
            __typename: "Tweet",
            rest_id: "2010076957938188661",
            legacy: {
              full_text: "The complete claude code tutorial https://t.co/i5L6UIPgH8",
              entities: {
                urls: [
                  {
                    url: "https://t.co/i5L6UIPgH8",
                    expanded_url: "https://x.com/eyad_khrais/status/2010076957938188661/article",
                  },
                ],
              },
            },
            core: {
              user_results: {
                result: {
                  legacy: {
                    screen_name: "eyad_khrais",
                  },
                },
              },
            },
          },
        },
      },
    };

    const tweet = parseTweetResultPayload(payload);
    expect(tweet?.id).toBe("2010076957938188661");
    expect(tweet?.username).toBe("eyad_khrais");
    expect(tweet?.url).toBe("https://x.com/eyad_khrais/status/2010076957938188661");
    expect(tweet?.text).toContain("The complete claude code tutorial");
    expect(tweet?.text).toContain("/article");
    expect(tweet?.text).not.toContain("https://t.co/");
  });
});

describe("resolveTweetQueryChunkUrl", () => {
  test("falls back to api chunk when main hash is unavailable", () => {
    const html = '"api":"a1b2c3d4"';
    expect(resolveTweetQueryChunkUrl(html)).toBe(
      "https://abs.twimg.com/responsive-web/client-web/api.a1b2c3d4a.js"
    );
  });
});
