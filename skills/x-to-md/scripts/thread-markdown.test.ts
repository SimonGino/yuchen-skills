import { describe, expect, test } from "bun:test";
import { formatThreadTweetsMarkdown } from "./thread-markdown";

describe("formatThreadTweetsMarkdown", () => {
  test("expands t.co links with tweet entity urls", () => {
    const markdown = formatThreadTweetsMarkdown(
      [
        {
          legacy: {
            id_str: "2010076957938188661",
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
        },
      ],
      { username: "eyad_khrais", includeTweetUrls: false }
    );

    expect(markdown).toContain("The complete claude code tutorial");
    expect(markdown).toContain("/article");
    expect(markdown).not.toContain("https://t.co/i5L6UIPgH8");
  });
});
