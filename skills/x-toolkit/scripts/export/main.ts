import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fxtweetToMarkdown } from "../common/fxtwitter";
import { localizeMarkdownMedia } from "../common/media-localizer";
import { getXOutputBaseDir } from "../common/wqq-skills-env";
import { parseTweetId } from "../common/url-utils";
import { createArgParser, takeOne, takeMany } from "../common/arg-parser";
import {
  buildTweetOutputDirName,
  findExistingTweetMarkdownPath,
  resolveTweetOutputPath,
  shouldSkipTweetOutput,
} from "../common/output";
import { writeManifest } from "../common/manifest";
import type { ExportSummary, ManifestEntry, ManifestFile, TweetExportArgs } from "../types";

type RuntimeDeps = {
  tweetToMarkdownImpl: typeof fxtweetToMarkdown;
  localizeMarkdownMediaImpl: typeof localizeMarkdownMedia;
};

const USAGE = `Usage:
  npx -y bun skills/x-toolkit/scripts/export/main.ts --urls <url1> <url2> ... [--output <dir>] [--no-download-media]`;

const parseExportArgsRaw = createArgParser<TweetExportArgs>(
  {
    mode: "tweets",
    urls: [],
    outputDir: path.resolve(getXOutputBaseDir(), "x-toolkit-output"),
    downloadMedia: true,
  },
  new Map([
    ["--urls", (args, argv, i) => {
      const { items, nextIndex } = takeMany(argv, i);
      if (items.length === 0) throw new Error("Missing values for --urls");
      args.urls.push(...items);
      return { nextIndex };
    }],
    ["--output", (args, argv, i) => {
      args.outputDir = path.resolve(takeOne(argv, i, "--output"));
      return { nextIndex: i + 1 };
    }],
    ["--no-download-media", (args, _argv, i) => {
      args.downloadMedia = false;
      return { nextIndex: i };
    }],
  ]),
  { usage: USAGE },
);

export function parseExportArgs(argv: string[]): TweetExportArgs {
  const args = parseExportArgsRaw(argv);
  if (args.urls.length === 0) {
    throw new Error("--urls is required");
  }
  return args;
}

type SingleUrlResult = {
  status: "success" | "skipped" | "failed";
  tweetId: string | null;
  markdownPath: string | null;
};

async function exportSingleUrl(
  url: string,
  args: TweetExportArgs,
  deps: RuntimeDeps,
  log: (message: string) => void,
): Promise<SingleUrlResult> {
  const tweetId = parseTweetId(url);
  if (!tweetId) {
    log(`[x-to-md] failed: invalid tweet url (${url})`);
    return { status: "failed", tweetId: null, markdownPath: null };
  }

  const existingPath = findExistingTweetMarkdownPath(args.outputDir, tweetId);
  if (shouldSkipTweetOutput(Boolean(existingPath))) {
    log(`[x-to-md] skipped: ${tweetId} (exists: ${existingPath})`);
    return { status: "skipped", tweetId, markdownPath: existingPath };
  }

  try {
    let markdown = await deps.tweetToMarkdownImpl(url, { log });

    const dirName = buildTweetOutputDirName(tweetId, markdown);
    const markdownPath = resolveTweetOutputPath(args.outputDir, dirName, tweetId);
    await mkdir(path.dirname(markdownPath), { recursive: true });

    if (args.downloadMedia) {
      const localized = await deps.localizeMarkdownMediaImpl(markdown, {
        markdownPath,
        log,
      });
      markdown = localized.markdown;
    }

    await writeFile(markdownPath, markdown, "utf8");
    log(`[x-to-md] success: ${tweetId} -> ${markdownPath}`);
    return { status: "success", tweetId, markdownPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`[x-to-md] failed: ${tweetId} (${message})`);
    return { status: "failed", tweetId, markdownPath: null };
  }
}

export async function runTweetExport(
  argv: string[],
  overrides: Partial<RuntimeDeps> = {},
): Promise<ExportSummary> {
  const args = parseExportArgs(argv);
  const log = console.log;

  const deps: RuntimeDeps = {
    tweetToMarkdownImpl: overrides.tweetToMarkdownImpl ?? fxtweetToMarkdown,
    localizeMarkdownMediaImpl: overrides.localizeMarkdownMediaImpl ?? localizeMarkdownMedia,
  };

  const summary: ExportSummary = { success: 0, skipped: 0, failed: 0 };
  const manifestNewFiles: ManifestEntry[] = [];
  const manifestSkipped: string[] = [];
  const manifestFailed: string[] = [];

  for (const url of args.urls) {
    const result = await exportSingleUrl(url, args, deps, log);
    summary[result.status] += 1;

    if (result.status === "success" && result.tweetId && result.markdownPath) {
      manifestNewFiles.push({
        tweetId: result.tweetId,
        path: path.relative(args.outputDir, result.markdownPath),
        author: "unknown",
      });
    } else if (result.status === "skipped" && result.tweetId) {
      manifestSkipped.push(result.tweetId);
    } else if (result.status === "failed" && result.tweetId) {
      manifestFailed.push(result.tweetId);
    }
  }

  const manifest: ManifestFile = {
    exportedAt: new Date().toISOString(),
    source: "urls",
    newFiles: manifestNewFiles,
    skipped: manifestSkipped,
    failed: manifestFailed,
  };
  await writeManifest(args.outputDir, manifest);

  log(
    `[x-to-md] done. success=${summary.success}, skipped=${summary.skipped}, failed=${summary.failed}, output=${args.outputDir}`,
  );
  return summary;
}

export const runExport = runTweetExport;

const isCliExecution = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCliExecution) {
  runTweetExport(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
