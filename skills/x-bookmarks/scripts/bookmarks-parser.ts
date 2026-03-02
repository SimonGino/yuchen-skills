import type { BookmarkTweet } from "./types";

type BookmarkPageDetails = {
  tweetIds: string[];
  nextCursor: string | null;
  tweetsById: Record<string, BookmarkTweet>;
};

function unwrapTweetResult(result: any): any {
  if (!result) {
    return null;
  }
  if (result.__typename === "TweetWithVisibilityResults" && result.tweet) {
    return result.tweet;
  }
  return result?.tweet ?? result;
}

function pickTweetId(result: any): string | null {
  const tweet = unwrapTweetResult(result);
  return tweet?.legacy?.id_str ?? tweet?.rest_id ?? null;
}

function pickTweetText(tweet: any): string {
  const noteText = tweet?.note_tweet?.note_tweet_results?.result?.text;
  const legacyText = tweet?.legacy?.full_text ?? tweet?.legacy?.text ?? "";
  return String(noteText ?? legacyText ?? "").trim();
}

function pickUsername(tweet: any): string | null {
  const username = tweet?.core?.user_results?.result?.legacy?.screen_name;
  return username ? String(username).trim() : null;
}

function pickMediaUrls(tweet: any): string[] {
  const mediaItems = tweet?.legacy?.extended_entities?.media ?? tweet?.legacy?.entities?.media ?? [];
  if (!Array.isArray(mediaItems)) {
    return [];
  }

  const urls: string[] = [];
  for (const media of mediaItems) {
    if (!media) {
      continue;
    }
    const mediaType = media.type;
    if (mediaType === "photo") {
      const imageUrl = media.media_url_https ?? media.media_url;
      if (imageUrl) {
        urls.push(String(imageUrl));
      }
      continue;
    }

    if (mediaType === "video" || mediaType === "animated_gif") {
      const variants = media.video_info?.variants;
      if (!Array.isArray(variants)) {
        continue;
      }
      const best = variants
        .filter((variant) => variant?.url && variant?.content_type === "video/mp4")
        .sort((a, b) => (b?.bitrate ?? 0) - (a?.bitrate ?? 0))[0];
      if (best?.url) {
        urls.push(String(best.url));
      }
    }
  }

  return urls;
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
  const instructions = (payload as any)?.data?.bookmark_timeline_v2?.timeline?.instructions;
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
