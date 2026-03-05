import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fxtweetToMarkdown } from "../../shared/x-runtime/fxtwitter";
import { localizeMarkdownMedia } from "../../shared/x-runtime/media-localizer";
import { getXOutputBaseDir } from "../../shared/wqq-skills-env";
import { parseTweetId } from "../../shared/x-runtime/url-utils";
import { createArgParser, takeOne, takeMany } from "../../shared/arg-parser";
import {
  buildTweetOutputDirName,
  findExistingTweetMarkdownPath,
  resolveTweetOutputPath,
  shouldSkipTweetOutput,
} from "../../shared/x-runtime/output";
import { summarizeMarkdownToChinese } from "./summarize";
import type { ExportArgs, ExportSummary } from "./types";

type RuntimeDeps = {
  tweetToMarkdownImpl: typeof fxtweetToMarkdown;
  localizeMarkdownMediaImpl: typeof localizeMarkdownMedia;
  summarizeImpl: typeof summarizeMarkdownToChinese;
};

const USAGE = `Usage:
  npx -y bun skills/x-to-md/scripts/main.ts --urls <url1> <url2> ... [--output <dir>] [--no-download-media]`;

const parseExportArgsRaw = createArgParser<ExportArgs>(
  {
    urls: [],
    outputDir: path.resolve(getXOutputBaseDir(), "wqq-x-to-md-output"),
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

export function parseExportArgs(argv: string[]): ExportArgs {
  const args = parseExportArgsRaw(argv);
  if (args.urls.length === 0) {
    throw new Error("--urls is required");
  }
  return args;
}

async function exportSingleUrl(
  url: string,
  args: ExportArgs,
  deps: RuntimeDeps,
  log: (message: string) => void,
): Promise<"success" | "skipped" | "failed"> {
  const tweetId = parseTweetId(url);
  if (!tweetId) {
    log(`[x-to-md] failed: invalid tweet url (${url})`);
    return "failed";
  }

  const existingPath = findExistingTweetMarkdownPath(args.outputDir, tweetId);
  if (shouldSkipTweetOutput(Boolean(existingPath))) {
    log(`[x-to-md] skipped: ${tweetId} (exists: ${existingPath})`);
    return "skipped";
  }

  try {
    let markdown = await deps.tweetToMarkdownImpl(url, { log });
    markdown = await deps.summarizeImpl(markdown, { log });

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
    return "success";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`[x-to-md] failed: ${tweetId} (${message})`);
    return "failed";
  }
}

export async function runExport(
  argv: string[],
  overrides: Partial<RuntimeDeps> = {},
): Promise<ExportSummary> {
  const args = parseExportArgs(argv);
  const log = console.log;

  const deps: RuntimeDeps = {
    tweetToMarkdownImpl: overrides.tweetToMarkdownImpl ?? fxtweetToMarkdown,
    localizeMarkdownMediaImpl:
      overrides.localizeMarkdownMediaImpl ?? localizeMarkdownMedia,
    summarizeImpl: overrides.summarizeImpl ?? summarizeMarkdownToChinese,
  };

  const summary: ExportSummary = { success: 0, skipped: 0, failed: 0 };

  for (const url of args.urls) {
    const status = await exportSingleUrl(url, args, deps, log);
    summary[status] += 1;
  }

  log(
    `[x-to-md] done. success=${summary.success}, skipped=${summary.skipped}, failed=${summary.failed}, output=${args.outputDir}`,
  );
  return summary;
}

const isCliExecution =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCliExecution) {
  runExport(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
