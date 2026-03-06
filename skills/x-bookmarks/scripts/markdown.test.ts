import { describe, expect, test } from "bun:test";
import { formatArticleMarkdown } from "./markdown";

describe("formatArticleMarkdown", () => {
  test("renders cover media image directly under the title", () => {
    const result = formatArticleMarkdown({
      title: "Demo Title",
      cover_media: {
        media_info: {
          original_img_url: "https://pbs.twimg.com/media/COVER.jpg",
        },
      },
      content_state: {
        blocks: [{ type: "unstyled", text: "Hello world" }],
        entityMap: {},
      },
      media_entities: [],
    });

    expect(result.coverUrl).toBe("https://pbs.twimg.com/media/COVER.jpg");
    expect(result.markdown).toContain("# Demo Title");
    expect(result.markdown).toContain("![](https://pbs.twimg.com/media/COVER.jpg)");
    expect(result.markdown.indexOf("![](https://pbs.twimg.com/media/COVER.jpg)")).toBeLessThan(
      result.markdown.indexOf("Hello world")
    );
  });

  test("resolves x.com article media fallback urls using media_entities", () => {
    const result = formatArticleMarkdown({
      title: "Fallback Demo",
      content_state: {
        blocks: [
          {
            type: "atomic",
            text: " ",
            entityRanges: [{ key: 0, offset: 0, length: 1 }],
          },
        ],
        entityMap: {
          "0": {
            value: {
              type: "IMAGE",
              data: {
                url: "https://x.com/elvissun/article/2025920521871716562/media/2025660629109895168",
              },
            },
          },
        },
      },
      media_entities: [
        {
          media_id: "2025660629109895168",
          media_info: {
            original_img_url: "https://pbs.twimg.com/media/REAL.jpg",
          },
        },
      ],
    });

    expect(result.markdown).toContain("![](https://pbs.twimg.com/media/REAL.jpg)");
    expect(result.markdown).not.toContain("/article/2025920521871716562/media/2025660629109895168");
    expect(result.markdown).not.toContain("\n## Media\n");
  });
});

