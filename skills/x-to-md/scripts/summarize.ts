import { buildEnvWithFileOnlyKeysFromWqqSkillsEnv } from "../../shared/wqq-skills-env";

export type SummarizeOptions = {
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  log?: (message: string) => void;
  summarizeImpl?: (body: string) => Promise<string>;
};

type OpenAiRequestInput = {
  body: string;
  fetchImpl: typeof fetch;
  env: NodeJS.ProcessEnv;
  log?: (message: string) => void;
};

const OPENAI_API_KEY_MISSING_ERROR =
  "Missing OPENAI_API_KEY. Set it in ~/.wqq-skills/.env to enable Chinese summarization.";
const SUMMARIZE_SYSTEM_PROMPT =
  "用中文为以下内容写一段摘要（1-3句话），简明扼要地概括核心要点。只输出摘要文字，不要加任何前缀、标签或解释。";

const FILE_ONLY_ENV_KEYS = ["OPENAI_API_KEY", "OPENAI_BASE_URL"] as const;

function splitFrontmatter(markdown: string): { frontmatter: string; body: string } {
  const match = markdown.match(/^---\n[\s\S]*?\n---\n?/);
  if (!match?.[0]) {
    return { frontmatter: "", body: markdown };
  }
  return {
    frontmatter: match[0].replace(/\n?$/, "\n"),
    body: markdown.slice(match[0].length),
  };
}

function stripMarkdownForSummary(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\n]+`/g, "")
    .replace(/!?\[[^\]\n]*\]\((?:<)?[^)\n]+(?:>)?\)/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractResponseText(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;

  if (Array.isArray(record.output)) {
    const lines: string[] = [];
    for (const outputItem of record.output) {
      if (!outputItem || typeof outputItem !== "object") continue;
      const content = (outputItem as Record<string, unknown>).content;
      if (!Array.isArray(content)) continue;
      for (const item of content) {
        if (!item || typeof item !== "object") continue;
        const text = (item as Record<string, unknown>).text;
        if (typeof text === "string" && text.trim()) {
          lines.push(text.trim());
        }
      }
    }
    if (lines.length > 0) return lines.join("\n").trim();
  }

  const choices = record.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const message = (choices[0] as Record<string, unknown>)?.message;
    if (message && typeof message === "object") {
      const content = (message as Record<string, unknown>).content;
      if (typeof content === "string") return content.trim();
      if (Array.isArray(content)) {
        const lines: string[] = [];
        for (const item of content) {
          if (!item || typeof item !== "object") continue;
          const text = (item as Record<string, unknown>).text;
          if (typeof text === "string" && text.trim()) lines.push(text.trim());
        }
        return lines.join("\n").trim();
      }
    }
  }

  return "";
}

async function requestResponsesSummary(input: OpenAiRequestInput): Promise<string> {
  const apiKey = input.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error(OPENAI_API_KEY_MISSING_ERROR);

  const baseUrl = (input.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = input.env.OPENAI_MODEL || "gpt-4o-mini";

  const response = await input.fetchImpl(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      store: false,
      input: [
        { role: "system", content: [{ type: "input_text", text: SUMMARIZE_SYSTEM_PROMPT }] },
        { role: "user", content: [{ type: "input_text", text: input.body }] },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI /responses summarization failed: ${response.status}`);
  }

  const data = (await response.json()) as unknown;
  const text = extractResponseText(data);
  if (!text) throw new Error("OpenAI /responses summarization response format is invalid");
  return text;
}

async function requestChatCompletionsSummary(input: OpenAiRequestInput): Promise<string> {
  const apiKey = input.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error(OPENAI_API_KEY_MISSING_ERROR);

  const baseUrl = (input.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = input.env.OPENAI_MODEL || "gpt-4o-mini";

  const response = await input.fetchImpl(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [
        { role: "system", content: SUMMARIZE_SYSTEM_PROMPT },
        { role: "user", content: input.body },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI /chat/completions summarization failed: ${response.status}`);
  }

  const data = (await response.json()) as unknown;
  const text = extractResponseText(data);
  if (!text) throw new Error("OpenAI /chat/completions summarization response format is invalid");
  return text;
}

async function requestOpenAiSummary(input: OpenAiRequestInput): Promise<string> {
  try {
    return await requestResponsesSummary(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    input.log?.(`[x-to-md] responses summarization fallback to chat (${message})`);
  }
  return requestChatCompletionsSummary(input);
}

export async function summarizeMarkdownToChinese(
  markdown: string,
  options: SummarizeOptions = {},
): Promise<string> {
  const env =
    options.env ||
    (await buildEnvWithFileOnlyKeysFromWqqSkillsEnv(
      FILE_ONLY_ENV_KEYS,
      process.env,
      process.env.HOME,
    ));
  const fetchImpl = options.fetchImpl || fetch;
  const log = options.log;

  const { frontmatter, body } = splitFrontmatter(markdown);
  const plainBody = stripMarkdownForSummary(body);
  if (!plainBody) {
    return markdown;
  }

  const summary = options.summarizeImpl
    ? await options.summarizeImpl(plainBody)
    : await requestOpenAiSummary({ body: plainBody, env, fetchImpl, log });

  const trimmedSummary = summary.trim();
  if (!trimmedSummary) {
    return markdown;
  }

  // Inject summary into frontmatter
  let newFrontmatter = frontmatter;
  if (newFrontmatter) {
    newFrontmatter = newFrontmatter.replace(
      /\n---\n$/,
      `\nsummary: ${JSON.stringify(trimmedSummary)}\n---\n`,
    );
  }

  // Insert blockquote after first heading or at top of body
  const trimmedBody = body.trimStart();
  const headingMatch = trimmedBody.match(/^(#[^\n]*\n(?:\n(?:!\[.*?\]\(.*?\))\n)?)\n?/);
  let newBody: string;
  if (headingMatch?.[0]) {
    const afterHeading = trimmedBody.slice(headingMatch[0].length);
    newBody = `${headingMatch[0]}\n> ${trimmedSummary}\n\n${afterHeading}`;
  } else {
    newBody = `> ${trimmedSummary}\n\n${trimmedBody}`;
  }

  return `${newFrontmatter}\n${newBody}`.trimEnd() + "\n";
}
