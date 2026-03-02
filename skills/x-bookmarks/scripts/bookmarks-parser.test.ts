import { describe, expect, test } from "bun:test";
import { extractBookmarkPage } from "./bookmarks-parser";

describe("extractBookmarkPage", () => {
  test("extracts tweet ids and next cursor", () => {
    const payload = {
      data: {
        bookmark_timeline_v2: {
          timeline: {
            instructions: [
              {
                entries: [
                  {
                    content: {
                      itemContent: {
                        tweet_results: {
                          result: { legacy: { id_str: "1001" } },
                        },
                      },
                    },
                  },
                  {
                    content: {
                      cursorType: "Bottom",
                      entryType: "TimelineTimelineCursor",
                      value: "cursor-1",
                    },
                  },
                ],
              },
            ],
          },
        },
      },
    };

    const page = extractBookmarkPage(payload);
    expect(page.tweetIds).toEqual(["1001"]);
    expect(page.nextCursor).toBe("cursor-1");
  });
});
