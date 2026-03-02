import { DEFAULT_BEARER_TOKEN, DEFAULT_USER_AGENT } from "../../shared/x-runtime/constants";
import {
  buildFeatureMap,
  buildFieldToggleMap,
  buildRequestHeaders,
  fetchHomeHtml,
  fetchText,
  parseStringList,
} from "../../shared/x-runtime/http";
import type { BookmarkTweet } from "./types";

type FetchTweetResultParams = {
  tweetId: string;
  cookieMap: Record<string, string>;
};

type TweetQueryInfo = {
  queryId: string;
  featureSwitches: string[];
  fieldToggles: string[];
  html: string;
};

function unwrapTweetResult(result: any): any {
  if (!result) return null;
  if (result.__typename === "TweetWithVisibilityResults" && result.tweet) {
    return result.tweet;
  }
  return result?.tweet ?? result;
}

function isLikelyShortLinkOnlyText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  return /^https?:\/\/t\.co\/\S+$/i.test(trimmed);
}

function expandTcoUrls(text: string, tweet: any): string {
  const urls = tweet?.legacy?.entities?.urls;
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

function pickTweetText(tweet: any): string {
  const noteText = tweet?.note_tweet?.note_tweet_results?.result?.text;
  const legacyText = tweet?.legacy?.full_text ?? tweet?.legacy?.text ?? "";
  return expandTcoUrls(String(noteText ?? legacyText ?? "").trim(), tweet).trim();
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
        .filter((variant) => variant?.url && variant?.content_type === "video/mp4")
        .sort((a, b) => (b?.bitrate ?? 0) - (a?.bitrate ?? 0))[0];
      if (best?.url) {
        urls.push(String(best.url));
      }
    }
  }

  return urls;
}

function resolveMainChunkHash(html: string): string | null {
  return (
    html.match(/main\\.([a-zA-Z0-9_-]+)\\.js/)?.[1] ??
    html.match(/\"main\":\"([a-zA-Z0-9_-]+)\"/)?.[1] ??
    null
  );
}

function resolveApiChunkHash(html: string): string | null {
  return (
    html.match(/api:\"([a-zA-Z0-9_-]+)\"/)?.[1] ??
    html.match(/\"api\":\"([a-zA-Z0-9_-]+)\"/)?.[1] ??
    null
  );
}

export function resolveTweetQueryChunkUrl(html: string): string {
  const mainHash = resolveMainChunkHash(html);
  if (mainHash) {
    return `https://abs.twimg.com/responsive-web/client-web/main.${mainHash}.js`;
  }

  const apiHash = resolveApiChunkHash(html);
  if (apiHash) {
    return `https://abs.twimg.com/responsive-web/client-web/api.${apiHash}a.js`;
  }

  throw new Error("tweet query chunk hash not found");
}

async function resolveTweetQueryInfo(userAgent: string): Promise<TweetQueryInfo> {
  const html = await fetchHomeHtml(userAgent);
  const chunkUrl = resolveTweetQueryChunkUrl(html);
  const chunk = await fetchText(chunkUrl, {
    headers: {
      "user-agent": userAgent,
    },
  });

  const queryMatch = chunk.match(/queryId:\"([^\"]+)\",operationName:\"TweetResultByRestId\"/);
  if (!queryMatch?.[1]) {
    throw new Error("TweetResultByRestId queryId not found");
  }

  const featureSwitches = parseStringList(
    chunk.match(/operationName:\"TweetResultByRestId\"[\s\S]*?featureSwitches:\[(.*?)\]/)?.[1]
  );
  const fieldToggles = parseStringList(
    chunk.match(/operationName:\"TweetResultByRestId\"[\s\S]*?fieldToggles:\[(.*?)\]/)?.[1]
  );

  return {
    queryId: queryMatch[1],
    featureSwitches,
    fieldToggles,
    html,
  };
}

function buildTweetFieldToggles(keys: string[]): Record<string, boolean> {
  const toggles = buildFieldToggleMap(keys);
  if (Object.prototype.hasOwnProperty.call(toggles, "withGrokAnalyze")) {
    toggles.withGrokAnalyze = false;
  }
  if (Object.prototype.hasOwnProperty.call(toggles, "withDisallowedReplyControls")) {
    toggles.withDisallowedReplyControls = false;
  }
  return toggles;
}

export function shouldHydrateTweet(tweet: BookmarkTweet): boolean {
  if (!tweet.username || tweet.username === "tweet") {
    return true;
  }
  if (isLikelyShortLinkOnlyText(tweet.text)) {
    return true;
  }
  return false;
}

export function parseTweetResultPayload(payload: unknown): BookmarkTweet | null {
  const result =
    (payload as any)?.data?.tweetResult?.result ??
    (payload as any)?.data?.tweet_result?.result ??
    (payload as any)?.data?.tweet_result;
  const tweet = unwrapTweetResult(result);
  const tweetId = tweet?.legacy?.id_str ?? tweet?.rest_id;
  if (!tweetId) {
    return null;
  }

  const username = pickUsername(tweet);
  return {
    id: String(tweetId),
    text: pickTweetText(tweet),
    username,
    url: username ? `https://x.com/${username}/status/${tweetId}` : `https://x.com/i/web/status/${tweetId}`,
    mediaUrls: pickMediaUrls(tweet),
  };
}

export async function fetchTweetResultByRestId(params: FetchTweetResultParams): Promise<BookmarkTweet | null> {
  const userAgent = process.env.X_USER_AGENT?.trim() || DEFAULT_USER_AGENT;
  const bearerToken = process.env.X_BEARER_TOKEN?.trim() || DEFAULT_BEARER_TOKEN;
  const queryInfo = await resolveTweetQueryInfo(userAgent);
  const features = buildFeatureMap(queryInfo.html, queryInfo.featureSwitches);
  const fieldToggles = buildTweetFieldToggles(queryInfo.fieldToggles);

  const url = new URL(`https://x.com/i/api/graphql/${queryInfo.queryId}/TweetResultByRestId`);
  url.searchParams.set(
    "variables",
    JSON.stringify({
      tweetId: params.tweetId,
      withCommunity: false,
      includePromotedContent: false,
      withVoice: true,
    })
  );

  if (Object.keys(features).length > 0) {
    url.searchParams.set("features", JSON.stringify(features));
  }
  if (Object.keys(fieldToggles).length > 0) {
    url.searchParams.set("fieldToggles", JSON.stringify(fieldToggles));
  }

  const response = await fetch(url.toString(), {
    headers: buildRequestHeaders(params.cookieMap, userAgent, bearerToken),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Tweet detail API error (${response.status}): ${text.slice(0, 300)}`);
  }

  return parseTweetResultPayload(JSON.parse(text));
}
