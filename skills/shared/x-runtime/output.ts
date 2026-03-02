import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

function sanitizePathSegment(input: string): string {
  return input
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 48);
}

const TWITTER_EPOCH_MS = 1288834974657n;

function formatUtcTimestamp(ms: bigint): string {
  const date = new Date(Number(ms));
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad2 = (value: number): string => String(value).padStart(2, "0");
  return [
    `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}`,
    `${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}`,
  ].join("-");
}

function buildTimestampPrefixFromTweetId(tweetId: string): string {
  if (!/^\d+$/.test(tweetId)) {
    return "";
  }

  try {
    const snowflake = BigInt(tweetId);
    const timestampMs = (snowflake >> 22n) + TWITTER_EPOCH_MS;
    return formatUtcTimestamp(timestampMs);
  } catch {
    return "";
  }
}

function extractFrontMatterField(markdown: string, key: string): string | null {
  const frontMatterMatch = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!frontMatterMatch?.[1]) {
    return null;
  }
  const fieldMatch = frontMatterMatch[1].match(new RegExp(`^${key}:\\s*\"([^\"]+)\"$`, "m"));
  return fieldMatch?.[1]?.trim() || null;
}

function extractPreviewText(markdown: string): string {
  const withoutFrontMatter = markdown.replace(/^---\n[\s\S]*?\n---\n?/, "");
  const h1Match = withoutFrontMatter.match(/^#\s+(.+)$/m);
  if (h1Match?.[1]?.trim()) {
    return h1Match[1].trim();
  }

  const lines = withoutFrontMatter.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    return trimmed;
  }

  return "";
}

export function buildTweetOutputDirName(tweetId: string, markdown: string): string {
  const timestamp = buildTimestampPrefixFromTweetId(tweetId);
  const preview = sanitizePathSegment(extractPreviewText(markdown));
  const author = sanitizePathSegment(extractFrontMatterField(markdown, "authorUsername") || "tweet");
  return [timestamp, preview, author, tweetId].filter(Boolean).join("-");
}

export function resolveTweetOutputPath(baseDir: string, dirName: string, tweetId: string): string {
  return path.join(baseDir, dirName, `${tweetId}.md`);
}

export function findExistingTweetMarkdownPath(baseDir: string, tweetId: string): string | null {
  const legacyPath = path.join(baseDir, tweetId, `${tweetId}.md`);
  if (existsSync(legacyPath)) {
    return legacyPath;
  }

  if (!existsSync(baseDir)) {
    return null;
  }

  for (const dirent of readdirSync(baseDir, { withFileTypes: true })) {
    if (!dirent.isDirectory()) {
      continue;
    }
    const candidate = path.join(baseDir, dirent.name, `${tweetId}.md`);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function shouldSkipTweetOutput(_markdownPath: string, exists: boolean): boolean {
  return exists;
}
