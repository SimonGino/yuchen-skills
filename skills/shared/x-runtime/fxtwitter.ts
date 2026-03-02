import { formatArticleMarkdown } from "./markdown";
import type { ArticleEntity, ArticleEntityMapEntry } from "./types";

const FXTWITTER_API = "https://api.fxtwitter.com";

type FxtweetResponse = {
  code: number;
  message: string;
  tweet: FxtweetData | null;
};

type FxtweetData = {
  url: string;
  id: string;
  text: string;
  raw_text?: { text: string };
  author: {
    name: string;
    screen_name: string;
  };
  created_at?: string;
  is_note_tweet?: boolean;
  article?: FxtweetArticle;
  media?: { all?: FxtweetMedia[] };
};

type FxtweetArticle = {
  title?: string;
  preview_text?: string;
  cover_media?: {
    media_info?: {
      original_img_url?: string;
    };
  };
  content?: {
    blocks?: unknown[];
    entityMap?: Array<{ key: string; value: unknown }>;
  };
  media_entities?: Array<{
    media_id?: string;
    media_info?: {
      original_img_url?: string;
    };
  }>;
};

type FxtweetMedia = {
  type?: string;
  url?: string;
  alt_text?: string;
};

export async function fetchFxtweet(tweetId: string): Promise<FxtweetData> {
  const url = `${FXTWITTER_API}/status/${tweetId}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`fxtwitter API error (${response.status})`);
  }
  const data = (await response.json()) as FxtweetResponse;
  if (data.code !== 200 || !data.tweet) {
    throw new Error(`Tweet not found: ${data.message}`);
  }
  return data.tweet;
}

function convertEntityMapToRecord(
  arr?: Array<{ key: string; value: unknown }>,
): Record<string, ArticleEntityMapEntry> | undefined {
  if (!arr || !Array.isArray(arr)) return undefined;
  const record: Record<string, ArticleEntityMapEntry> = {};
  for (const entry of arr) {
    if (entry.key !== undefined) {
      record[String(entry.key)] = entry as ArticleEntityMapEntry;
    }
  }
  return record;
}

function fxtweetArticleToEntity(article: FxtweetArticle): ArticleEntity {
  return {
    title: article.title,
    preview_text: article.preview_text,
    content_state: article.content
      ? {
          blocks: article.content.blocks as ArticleEntity["content_state"] extends
            | { blocks?: infer B }
            | undefined
            ? B
            : never,
          entityMap: convertEntityMapToRecord(article.content.entityMap),
        }
      : undefined,
    cover_media: article.cover_media
      ? { media_info: article.cover_media.media_info }
      : undefined,
    media_entities: article.media_entities,
  };
}

function parseTweetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return trimmed;
  try {
    const parsed = new URL(trimmed);
    const match = parsed.pathname.match(/\/status(?:es)?\/(\d+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function formatMetaMarkdown(
  meta: Record<string, string | number | null | undefined>,
): string {
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

function formatRegularTweetMarkdown(tweet: FxtweetData): string {
  const lines: string[] = [];
  const text = tweet.text || tweet.raw_text?.text || "";
  if (text) {
    lines.push(text);
  }
  for (const m of tweet.media?.all ?? []) {
    if (m.type === "photo" && m.url) {
      const alt = m.alt_text ? m.alt_text.replace(/[\[\]]/g, "\\$&") : "";
      lines.push("", `![${alt}](${m.url})`);
    } else if ((m.type === "video" || m.type === "gif") && m.url) {
      lines.push("", `[Video](${m.url})`);
    }
  }
  return lines.join("\n");
}

type FxtweetToMarkdownOptions = {
  log?: (message: string) => void;
};

export async function fxtweetToMarkdown(
  inputUrl: string,
  options: FxtweetToMarkdownOptions = {},
): Promise<string> {
  const tweetId = parseTweetId(inputUrl);
  if (!tweetId) {
    throw new Error(
      "Invalid tweet url. Example: https://x.com/<user>/status/<tweet_id>",
    );
  }

  const log = options.log ?? (() => {});
  log(`[fxtwitter] Fetching ${tweetId}...`);

  const tweet = await fetchFxtweet(tweetId);
  const { name, screen_name: username } = tweet.author;
  const author =
    username && name
      ? `${name} (@${username})`
      : username
        ? `@${username}`
        : (name ?? null);
  const authorUrl = username ? `https://x.com/${username}` : undefined;
  const tweetUrl = tweet.url || inputUrl.trim();

  const parts: string[] = [];
  let coverImage: string | null = null;

  if (tweet.article) {
    const articleEntity = fxtweetArticleToEntity(tweet.article);
    const articleResult = formatArticleMarkdown(articleEntity);
    coverImage = articleResult.coverUrl;
    if (articleResult.markdown.trimEnd()) {
      parts.push(articleResult.markdown.trimEnd());
    }
  } else {
    const tweetMarkdown = formatRegularTweetMarkdown(tweet);
    if (tweetMarkdown) {
      parts.push(tweetMarkdown);
    }
  }

  const meta = formatMetaMarkdown({
    url: tweetUrl,
    author,
    authorName: name ?? null,
    authorUsername: username ?? null,
    authorUrl: authorUrl ?? null,
    tweetCount: 1,
    coverImage,
  });

  parts.unshift(meta);
  return parts.join("\n\n").trimEnd();
}
