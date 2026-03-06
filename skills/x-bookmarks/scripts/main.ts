import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasRequiredXCookies, loadXCookies } from "./cookies";
import { localizeMarkdownMedia } from "./media-localizer";
import { tweetToMarkdown } from "./tweet-to-markdown";
import { getXOutputBaseDir } from "./wqq-skills-env";
import { createArgParser, takeOne, parsePositiveInt } from "./arg-parser";
import { sleepWithJitter } from "./retry";
import { fetchBookmarksPage } from "./bookmarks-api";
import { extractBookmarkPageDetails } from "./bookmarks-parser";
import { loadExportState, saveExportState, isExported, addExportedId } from "./state";
import {
  buildTweetOutputDirName,
  findExistingTweetMarkdownPath,
  resolveTweetOutputPath,
  shouldSkipTweetOutput,
} from "./output";
import { writeBookmarkSummary } from "./summary";
import type { BookmarkTweet, ExportArgs, ExportSummary } from "./types";
import type { XCookieMap } from "./x-types";

const USAGE = `Usage:
  npx -y bun skills/x-bookmarks/scripts/main.ts [--limit <n>] [--all] [--output <dir>] [--no-download-media] [--with-summary]`;

export const parseExportArgs = createArgParser<ExportArgs>(
  {
    limit: 50,
    all: false,
    outputDir: path.resolve(getXOutputBaseDir(), "wqq-x-bookmarks-output"),
    downloadMedia: true,
    withSummary: false,
  },
  new Map([
    ["--limit", (args, argv, i) => {
      args.limit = parsePositiveInt(takeOne(argv, i, "--limit"), "--limit");
      return { nextIndex: i + 1 };
    }],
    ["--all", (args, _argv, i) => {
      args.all = true;
      args.limit = Infinity;
      return { nextIndex: i };
    }],
    ["--output", (args, argv, i) => {
      args.outputDir = path.resolve(takeOne(argv, i, "--output"));
      return { nextIndex: i + 1 };
    }],
    ["--no-download-media", (args, _argv, i) => {
      args.downloadMedia = false;
      return { nextIndex: i };
    }],
    ["--with-summary", (args, _argv, i) => {
      args.withSummary = true;
      return { nextIndex: i };
    }],
  ]),
  { usage: USAGE },
);

async function collectBookmarkTweets(
  cookieMap: XCookieMap,
  limit: number,
  log: (message: string) => void,
  startCursor?: string,
): Promise<{ tweetIds: string[]; tweetsById: Record<string, BookmarkTweet>; lastCursor: string | null }> {
  const tweetIds: string[] = [];
  const tweetsById: Record<string, BookmarkTweet> = {};
  const seenIds = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: string | undefined = startCursor;
  let lastCursor: string | null = null;
  let pageNum = 0;

  while (tweetIds.length < limit) {
    if (pageNum > 0) {
      log(`[bookmarks-export] throttle: waiting before next page...`);
      await sleepWithJitter(2000, 2000);
    }

    const count = Math.min(20, limit - tweetIds.length);
    const payload = await fetchBookmarksPage({ cookieMap, count, cursor });
    const page = extractBookmarkPageDetails(payload);
    pageNum++;

    for (const [tweetId, tweet] of Object.entries(page.tweetsById)) {
      if (!tweetsById[tweetId]) {
        tweetsById[tweetId] = tweet;
      }
    }

    for (const tweetId of page.tweetIds) {
      if (seenIds.has(tweetId)) {
        continue;
      }
      seenIds.add(tweetId);
      tweetIds.push(tweetId);
      if (tweetIds.length >= limit) {
        break;
      }
    }

    if (!page.nextCursor || seenCursors.has(page.nextCursor)) {
      break;
    }

    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
    lastCursor = page.nextCursor;
    log(`[bookmarks-export] page ${pageNum}: collected ${tweetIds.length} ids, next cursor: ${cursor}`);
  }

  return { tweetIds, tweetsById, lastCursor };
}

function resolveTweetSeedUrl(tweetId: string, tweet: BookmarkTweet | undefined): string {
  const candidate = tweet?.url?.trim();
  if (candidate && /^https?:\/\//i.test(candidate)) {
    return candidate;
  }
  return `https://x.com/i/web/status/${tweetId}`;
}

async function exportSingleTweet(
  tweetId: string,
  tweetUrl: string,
  cookieMap: XCookieMap,
  args: ExportArgs,
  log: (message: string) => void
): Promise<{ status: "success" | "skipped" | "failed"; markdownPath: string | null }> {
  const existingPath = findExistingTweetMarkdownPath(args.outputDir, tweetId);
  if (shouldSkipTweetOutput(Boolean(existingPath))) {
    log(`[bookmarks-export] skipped: ${tweetId} (exists: ${existingPath})`);
    return {
      status: "skipped",
      markdownPath: existingPath ?? null,
    };
  }

  try {
    let markdown = await tweetToMarkdown(tweetUrl, { log, cookieMap });
    const dirName = buildTweetOutputDirName(tweetId, markdown);
    const markdownPath = resolveTweetOutputPath(args.outputDir, dirName, tweetId);

    await mkdir(path.dirname(markdownPath), { recursive: true });
    await writeFile(markdownPath, markdown, "utf8");

    if (args.downloadMedia) {
      const localized = await localizeMarkdownMedia(markdown, {
        markdownPath,
        log,
      });
      if (localized.markdown !== markdown) {
        markdown = localized.markdown;
        await writeFile(markdownPath, markdown, "utf8");
      }
    }

    log(`[bookmarks-export] success: ${tweetId} -> ${markdownPath}`);
    return {
      status: "success",
      markdownPath,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`[bookmarks-export] failed: ${tweetId} (${message})`);
    return {
      status: "failed",
      markdownPath: null,
    };
  }
}

export async function runBookmarksExport(argv: string[]): Promise<ExportSummary> {
  const args = parseExportArgs(argv);
  const log = console.log;

  log("[bookmarks-export] loading cookies");
  const rawCookieMap = await loadXCookies(log);
  if (!hasRequiredXCookies(rawCookieMap)) {
    throw new Error("Missing auth cookies. Provide X_AUTH_TOKEN and X_CT0.");
  }
  const cookieMap = rawCookieMap;

  // Load state for dedup and resume
  const state = await loadExportState(args.outputDir);
  const startCursor = args.all ? (state.lastCursor ?? undefined) : undefined;

  const limitLabel = args.all ? "all" : String(args.limit);
  log(`[bookmarks-export] collecting ${limitLabel} bookmarks`);
  const collected = await collectBookmarkTweets(cookieMap, args.limit, log, startCursor);
  log(`[bookmarks-export] collected ${collected.tweetIds.length} tweet ids`);

  // Update cursor in state
  if (collected.lastCursor) {
    state.lastCursor = collected.lastCursor;
  }

  const summary: ExportSummary = { success: 0, skipped: 0, failed: 0 };
  const summarySources: Array<{ tweetId: string; markdownPath: string }> = [];
  let consecutiveFailures = 0;

  for (let idx = 0; idx < collected.tweetIds.length; idx++) {
    const tweetId = collected.tweetIds[idx]!;

    // Check state file first (fast path)
    if (isExported(state, tweetId)) {
      log(`[bookmarks-export] skipped (state): ${tweetId}`);
      summary.skipped += 1;
      if (args.withSummary) {
        const existingPath = findExistingTweetMarkdownPath(args.outputDir, tweetId);
        if (existingPath) {
          summarySources.push({ tweetId, markdownPath: existingPath });
        }
      }
      continue;
    }

    // Check filesystem (backwards compat)
    const existingPath = findExistingTweetMarkdownPath(args.outputDir, tweetId);
    if (existingPath) {
      log(`[bookmarks-export] skipped (exists): ${tweetId}`);
      addExportedId(state, tweetId);
      await saveExportState(args.outputDir, state);
      summary.skipped += 1;
      summarySources.push({ tweetId, markdownPath: existingPath });
      continue;
    }

    // Adaptive throttle: back off longer after consecutive failures
    if (summary.success > 0 || consecutiveFailures > 0) {
      if (consecutiveFailures >= 5) {
        log(`[bookmarks-export] throttle: ${consecutiveFailures} consecutive failures, long backoff (120s)...`);
        await sleepWithJitter(120_000, 30_000);
      } else if (consecutiveFailures >= 3) {
        log(`[bookmarks-export] throttle: ${consecutiveFailures} consecutive failures, backing off (60s)...`);
        await sleepWithJitter(60_000, 15_000);
      } else {
        log(`[bookmarks-export] throttle: waiting before next tweet...`);
        await sleepWithJitter(3000, 2000);
      }
    }

    const tweetUrl = resolveTweetSeedUrl(tweetId, collected.tweetsById[tweetId]);
    const result = await exportSingleTweet(tweetId, tweetUrl, cookieMap, args, log);
    summary[result.status] += 1;

    if (result.status === "failed") {
      consecutiveFailures++;
    } else {
      consecutiveFailures = 0;
    }

    if (result.status === "success") {
      addExportedId(state, tweetId);
      state.lastRunAt = new Date().toISOString();
      await saveExportState(args.outputDir, state);
    }

    if (result.markdownPath) {
      summarySources.push({ tweetId, markdownPath: result.markdownPath });
    }

    // Log progress
    const total = collected.tweetIds.length;
    const done = summary.success + summary.skipped + summary.failed;
    log(`[bookmarks-export] progress: ${done}/${total}`);
  }

  if (args.withSummary) {
    const summaryPath = await writeBookmarkSummary(args.outputDir, summarySources, log);
    if (summaryPath) {
      log(`[bookmarks-export] summary: ${summaryPath}`);
    } else {
      log("[bookmarks-export] summary: skipped (no readable markdown files)");
    }
  }

  // Final state save
  state.lastRunAt = new Date().toISOString();
  await saveExportState(args.outputDir, state);

  log(
    `[bookmarks-export] done. success=${summary.success}, skipped=${summary.skipped}, failed=${summary.failed}, output=${args.outputDir}`
  );

  return summary;
}

const isCliExecution = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCliExecution) {
  runBookmarksExport(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
