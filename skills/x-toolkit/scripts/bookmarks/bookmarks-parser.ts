import { unwrapTweetResult, pickTweetText, pickUsername, pickMediaUrls } from "../common/tweet-utils";
import type { BookmarkTweet } from "../types";
import type { BookmarkTimelineResponse } from "../common/x-types";

type BookmarkPageDetails = {
  tweetIds: string[];
  nextCursor: string | null;
  tweetsById: Record<string, BookmarkTweet>;
};

function pickTweetId(result: any): string | null {
  const tweet = unwrapTweetResult(result);
  return tweet?.legacy?.id_str ?? tweet?.rest_id ?? null;
}

function collectFromItemContent(itemContent: any, ids: Set<string>, tweetsById: Record<string, BookmarkTweet>): void {
  const result = itemContent?.tweet_results?.result;
  const tweet = unwrapTweetResult(result);
  const tweetId = pickTweetId(result);
  if (!tweetId) {
    return;
  }

  ids.add(tweetId);
  if (tweetsById[tweetId]) {
    return;
  }

  const username = pickUsername(tweet);
  tweetsById[tweetId] = {
    id: tweetId,
    text: pickTweetText(tweet),
    username,
    url: username ? `https://x.com/${username}/status/${tweetId}` : `https://x.com/i/web/status/${tweetId}`,
    mediaUrls: pickMediaUrls(tweet),
  };
}

function readBottomCursor(content: any): string | null {
  if (content?.cursorType === "Bottom" && content?.entryType === "TimelineTimelineCursor") {
    return content?.value ?? null;
  }
  if (content?.itemContent?.cursorType === "Bottom" && content?.itemContent?.itemType === "TimelineTimelineCursor") {
    return content?.itemContent?.value ?? null;
  }
  return null;
}

function walkEntry(entry: any, ids: Set<string>, tweetsById: Record<string, BookmarkTweet>): string | null {
  const content = entry?.content ?? entry;
  const cursor = readBottomCursor(content);
  if (cursor) {
    return cursor;
  }

  collectFromItemContent(content?.itemContent, ids, tweetsById);

  const items = content?.items ?? entry?.items;
  if (Array.isArray(items)) {
    for (const item of items) {
      const itemContent = item?.item?.itemContent ?? item?.itemContent;
      const itemCursor = readBottomCursor(itemContent);
      if (itemCursor) {
        return itemCursor;
      }
      collectFromItemContent(itemContent, ids, tweetsById);
    }
  }

  return null;
}

export function extractBookmarkPageDetails(payload: unknown): BookmarkPageDetails {
  const typed = payload as BookmarkTimelineResponse;
  const instructions = typed?.data?.bookmark_timeline_v2?.timeline?.instructions;
  if (!Array.isArray(instructions)) {
    return { tweetIds: [], nextCursor: null, tweetsById: {} };
  }

  const ids = new Set<string>();
  const tweetsById: Record<string, BookmarkTweet> = {};
  let nextCursor: string | null = null;

  for (const instruction of instructions) {
    const entries = [...(instruction?.entries ?? []), ...(instruction?.moduleItems ?? [])];
    for (const entry of entries) {
      const cursor = walkEntry(entry, ids, tweetsById);
      if (cursor) {
        nextCursor = cursor;
      }
    }
  }

  return { tweetIds: [...ids], nextCursor, tweetsById };
}

export function extractBookmarkPage(payload: unknown): { tweetIds: string[]; nextCursor: string | null } {
  const page = extractBookmarkPageDetails(payload);
  return { tweetIds: page.tweetIds, nextCursor: page.nextCursor };
}
