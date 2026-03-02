import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildEnvWithFileOnlyKeysFromWqqSkillsEnv } from "../../shared/wqq-skills-env";

export type BookmarkSummarySource = {
  tweetId: string;
  markdownPath: string;
};

export type BookmarkSummaryEntry = {
  tweetId: string;
  title: string;
  authorUsername: string;
  url: string;
  oneLineSummary: string;
  relevanceReason: string;
  relativePath: string;
};

export type ParsedBookmarkSummary = {
  tweetId: string;
  title: string;
  authorUsername: string;
  url: string;
  excerpt: string;
};

type AiSummaryResult = {
  oneLineSummary: string;
  relevanceReason: string;
  usedFallback: boolean;
};

const FALLBACK_RELEVANCE_REASON = "与技术实践相关，建议按需阅读原文。";
const OPENAI_API_KEY_MISSING_ERROR = "Missing OPENAI_API_KEY. Set it in ~/.wqq-skills/.env to enable --with-summary.";
const AI_SYSTEM_PROMPT =
  "You summarize X bookmarks for Chinese readers. Reply in exactly two lines with labels: 一句话摘要：... and 相关性说明：...";

const FILE_ONLY_ENV_KEYS = ["OPENAI_API_KEY", "OPENAI_BASE_URL"] as const;

function isMissingOpenAiApiKeyError(error: unknown): boolean {
  return error instanceof Error && error.message === OPENAI_API_KEY_MISSING_ERROR;
}

function buildFallbackSummary(fallbackExcerpt: string): AiSummaryResult {
  return {
    oneLineSummary: fallbackExcerpt || "(empty)",
    relevanceReason: FALLBACK_RELEVANCE_REASON,
    usedFallback: true,
  };
}

function parseAiSummaryContent(content: string): Omit<AiSummaryResult, "usedFallback"> | null {
  const oneLineSummary = content.match(/(?:^|\n)一句话摘要[:：]\s*(.+)/)?.[1]?.trim() || "";
  const relevanceReason = content.match(/(?:^|\n)相关性说明[:：]\s*(.+)/)?.[1]?.trim() || "";
  if (!oneLineSummary || !relevanceReason) {
    return null;
  }

  return {
    oneLineSummary,
    relevanceReason,
  };
}

function extractFrontMatter(markdown: string): string {
  return markdown.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
}

function extractFrontMatterField(frontMatter: string, key: string): string | null {
  const quotedMatch = frontMatter.match(new RegExp(`^${key}:\\s*\"([^\"]*)\"$`, "m"));
  if (quotedMatch?.[1] !== undefined) {
    return quotedMatch[1].trim();
  }

  const plainMatch = frontMatter.match(new RegExp(`^${key}:\\s*([^\\n]+)$`, "m"));
  if (plainMatch?.[1] !== undefined) {
    return plainMatch[1].trim();
  }

  return null;
}

function extractBody(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n?/, "");
}

function extractTitle(tweetId: string, body: string): string {
  const title = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return title || `Tweet ${tweetId}`;
}

function extractExcerpt(body: string): string {
  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (line.startsWith("#")) continue;
    if (/^https?:\/\/\S+$/i.test(line)) continue;
    return line.length > 160 ? `${line.slice(0, 160)}...` : line;
  }
  return "";
}

function appendIfText(target: string[], value: unknown): void {
  if (typeof value !== "string") {
    return;
  }

  const text = value.trim();
  if (text) {
    target.push(text);
  }
}

function extractTextFromContentItem(item: unknown): string {
  if (typeof item === "string") {
    return item.trim();
  }

  if (!item || typeof item !== "object") {
    return "";
  }

  const record = item as Record<string, unknown>;
  const lines: string[] = [];
  appendIfText(lines, record.text);
  appendIfText(lines, record.output_text);

  return lines.join("\n").trim();
}

function extractResponsesText(data: unknown): string {
  if (!data || typeof data !== "object") {
    return "";
  }

  const record = data as Record<string, unknown>;
  const lines: string[] = [];

  appendIfText(lines, record.output_text);
  if (Array.isArray(record.output_text)) {
    for (const item of record.output_text) {
      appendIfText(lines, item);
      if (item && typeof item === "object") {
        appendIfText(lines, (item as Record<string, unknown>).text);
      }
    }
  }

  if (Array.isArray(record.output)) {
    for (const outputItem of record.output) {
      if (!outputItem || typeof outputItem !== "object") {
        continue;
      }

      const outputRecord = outputItem as Record<string, unknown>;
      const content = outputRecord.content;
      if (!Array.isArray(content)) {
        continue;
      }

      for (const contentItem of content) {
        appendIfText(lines, extractTextFromContentItem(contentItem));
      }
    }
  }

  return lines.join("\n").trim();
}

function extractChatCompletionsText(data: unknown): string {
  if (!data || typeof data !== "object") {
    return "";
  }

  const record = data as Record<string, unknown>;
  const choices = record.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return "";
  }

  const firstChoice = choices[0];
  if (!firstChoice || typeof firstChoice !== "object") {
    return "";
  }

  const message = (firstChoice as Record<string, unknown>).message;
  if (!message || typeof message !== "object") {
    return "";
  }

  const content = (message as Record<string, unknown>).content;
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  const lines: string[] = [];
  for (const item of content) {
    appendIfText(lines, extractTextFromContentItem(item));
  }

  return lines.join("\n").trim();
}

function buildUserPrompt(markdown: string): string {
  return `请总结下面内容并只输出两行：\n一句话摘要：...\n相关性说明：...\n\n${markdown}`;
}

async function requestResponsesSummaryContent(input: {
  fetchImpl: typeof fetch;
  baseUrl: string;
  apiKey: string;
  model: string;
  markdown: string;
}): Promise<string> {
  const response = await input.fetchImpl(`${input.baseUrl}/responses`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model: input.model,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: AI_SYSTEM_PROMPT }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: buildUserPrompt(input.markdown) }],
        },
      ],
      store: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI /responses request failed: ${response.status}`);
  }

  const data = (await response.json()) as unknown;
  const content = extractResponsesText(data);
  if (!content) {
    throw new Error("OpenAI /responses response format is invalid");
  }

  return content;
}

async function requestChatCompletionsSummaryContent(input: {
  fetchImpl: typeof fetch;
  baseUrl: string;
  apiKey: string;
  model: string;
  markdown: string;
}): Promise<string> {
  const response = await input.fetchImpl(`${input.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: AI_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: buildUserPrompt(input.markdown),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI /chat/completions request failed: ${response.status}`);
  }

  const data = (await response.json()) as unknown;
  const content = extractChatCompletionsText(data);
  if (!content) {
    throw new Error("OpenAI /chat/completions response format is invalid");
  }

  return content;
}

export function parseBookmarkMarkdown(tweetId: string, markdown: string): ParsedBookmarkSummary {
  const frontMatter = extractFrontMatter(markdown);
  const body = extractBody(markdown);
  return {
    tweetId,
    title: extractTitle(tweetId, body),
    authorUsername: extractFrontMatterField(frontMatter, "authorUsername") || "tweet",
    url: extractFrontMatterField(frontMatter, "url") || `https://x.com/i/web/status/${tweetId}`,
    excerpt: extractExcerpt(body),
  };
}

export async function generateAiSummaryForBookmark(input: {
  markdown: string;
  fallbackExcerpt: string;
  url: string;
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  log?: (message: string) => void;
}): Promise<AiSummaryResult> {
  const fallback = buildFallbackSummary(input.fallbackExcerpt);
  const env =
    input.env ||
    (await buildEnvWithFileOnlyKeysFromWqqSkillsEnv(
      FILE_ONLY_ENV_KEYS,
      process.env,
      process.env.HOME,
    ));
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(OPENAI_API_KEY_MISSING_ERROR);
  }

  const fetchImpl = input.fetchImpl || fetch;
  const baseUrl = (env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = env.OPENAI_MODEL || "gpt-4o-mini";

  try {
    const content = await requestResponsesSummaryContent({
      fetchImpl,
      baseUrl,
      apiKey,
      model,
      markdown: input.markdown,
    });
    const parsed = parseAiSummaryContent(content);
    if (!parsed) {
      throw new Error("OpenAI /responses summary format is invalid");
    }

    return {
      ...parsed,
      usedFallback: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    input.log?.(`[bookmarks-export] ai summary responses fallback to chat: ${input.url} (${message})`);
  }

  try {
    const content = await requestChatCompletionsSummaryContent({
      fetchImpl,
      baseUrl,
      apiKey,
      model,
      markdown: input.markdown,
    });
    const parsed = parseAiSummaryContent(content);
    if (!parsed) {
      throw new Error("OpenAI /chat/completions summary format is invalid");
    }

    return {
      ...parsed,
      usedFallback: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    input.log?.(`[bookmarks-export] ai summary fallback: ${input.url} (${message})`);
    return fallback;
  }
}

export function renderBookmarkSummaryMarkdown(entries: BookmarkSummaryEntry[]): string {
  const lines: string[] = [
    "# X Bookmarks Summary",
    "",
    `GeneratedAt: ${new Date().toISOString()}`,
    `Total: ${entries.length}`,
    "",
    "## Items",
    "",
  ];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;
    lines.push(`${i + 1}. [${entry.title}](${entry.relativePath})`);
    lines.push(`TweetId: \`${entry.tweetId}\` | Author: @${entry.authorUsername}`);
    lines.push(`一句话摘要：${entry.oneLineSummary || "(empty)"}`);
    lines.push(`相关性说明：${entry.relevanceReason || "(empty)"}`);
    lines.push(`来源链接：[原帖](${entry.url})`);
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export async function writeBookmarkSummary(
  outputDir: string,
  sources: BookmarkSummarySource[],
  log?: (message: string) => void
): Promise<string | null> {
  if (sources.length === 0) {
    return null;
  }

  const env = await buildEnvWithFileOnlyKeysFromWqqSkillsEnv(
    FILE_ONLY_ENV_KEYS,
    process.env,
    process.env.HOME,
  );

  const entries: BookmarkSummaryEntry[] = [];
  for (const source of sources) {
    try {
      const markdown = await readFile(source.markdownPath, "utf8");
      const parsed = parseBookmarkMarkdown(source.tweetId, markdown);
      const ai = await generateAiSummaryForBookmark({
        markdown,
        fallbackExcerpt: parsed.excerpt,
        url: parsed.url,
        log,
        env,
      });
      entries.push({
        tweetId: parsed.tweetId,
        title: parsed.title,
        authorUsername: parsed.authorUsername,
        url: parsed.url,
        oneLineSummary: ai.oneLineSummary,
        relevanceReason: ai.relevanceReason,
        relativePath: path.relative(outputDir, source.markdownPath).split(path.sep).join("/"),
      });
    } catch (error) {
      if (isMissingOpenAiApiKeyError(error)) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      log?.(`[bookmarks-export] summary skipped: ${source.tweetId} (${message})`);
    }
  }

  if (entries.length === 0) {
    return null;
  }

  const summaryPath = path.join(outputDir, "SUMMARY.md");
  const summaryMarkdown = renderBookmarkSummaryMarkdown(entries);
  await writeFile(summaryPath, summaryMarkdown, "utf8");
  return summaryPath;
}
