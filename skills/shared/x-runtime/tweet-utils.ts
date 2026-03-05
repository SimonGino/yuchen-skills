import type { TweetResult } from "./types";

export function unwrapTweetResult(result: TweetResult | null | undefined): TweetResult | null {
  if (!result) return null;
  if (result.__typename === "TweetWithVisibilityResults" && result.tweet) {
    return result.tweet;
  }
  return result?.tweet ?? result;
}

export function expandTcoUrls(text: string, tweet: TweetResult | null | undefined): string {
  const urls = tweet?.legacy?.entities?.urls as Array<{ url?: string; expanded_url?: string; unwound_url?: string }> | undefined;
  if (!Array.isArray(urls) || !text) {
    return text;
  }

  let expanded = text;
  for (const item of urls) {
    const shortUrl = item?.url;
    const expandedUrl = item?.expanded_url ?? item?.unwound_url;
    if (!shortUrl || !expandedUrl) {
      continue;
    }
    expanded = expanded.split(String(shortUrl)).join(String(expandedUrl));
  }
  return expanded;
}

export function pickTweetText(tweet: TweetResult | null | undefined): string {
  const noteText = tweet?.note_tweet?.note_tweet_results?.result?.text;
  const legacyText = tweet?.legacy?.full_text ?? tweet?.legacy?.text ?? "";
  return expandTcoUrls(String(noteText ?? legacyText ?? "").trim(), tweet).trim();
}

export function pickUsername(tweet: TweetResult | null | undefined): string | null {
  const username = tweet?.core?.user_results?.result?.legacy?.screen_name;
  return username ? String(username).trim() : null;
}

export function pickMediaUrls(tweet: TweetResult | null | undefined): string[] {
  const mediaItems = tweet?.legacy?.extended_entities?.media ?? tweet?.legacy?.entities?.media ?? [];
  if (!Array.isArray(mediaItems)) {
    return [];
  }

  const urls: string[] = [];
  for (const media of mediaItems) {
    if (!media) continue;
    if (media.type === "photo") {
      const imageUrl = media.media_url_https ?? media.media_url;
      if (imageUrl) urls.push(String(imageUrl));
      continue;
    }

    if (media.type === "video" || media.type === "animated_gif") {
      const variants = media.video_info?.variants;
      if (!Array.isArray(variants)) continue;
      const best = variants
        .filter((variant: any) => variant?.url && variant?.content_type === "video/mp4")
        .sort((a: any, b: any) => (b?.bitrate ?? 0) - (a?.bitrate ?? 0))[0];
      if (best?.url) {
        urls.push(String(best.url));
      }
    }
  }

  return urls;
}

export function formatMetaMarkdown(meta: Record<string, string | number | null | undefined>): string {
  const lines = ["---"];
  for (const [key, value] of Object.entries(meta)) {
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "number") {
      lines.push(`${key}: ${value}`);
    } else {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}
