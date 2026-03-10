import path from "node:path";
import process from "node:process";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import type { CliArgs, Source, SourceMetadata } from "./types";
import { formatError } from "./retry";
import {
  ingestWorkspace,
  type AutoSummary,
  type NormalizedSource,
} from "./workspace-ingest";

function printUsage(): void {
  console.log(`Usage:
  npx -y bun scripts/main.ts
  npx -y bun scripts/main.ts --workspace ./my-workspace
  npx -y bun scripts/main.ts --sources sources/*.md --summary "一句话总结"
  npx -y bun scripts/main.ts --sources sources/*.md --summary "..." --outline "要点1,要点2,要点3"

Options:
  --workspace <path>    Workspace root (default: current directory)
  --sources <files...>  Source markdown files (legacy mode)
  --summary <text>      One-sentence summary (required in --sources mode)
  --outline <text>      Optional outline points (comma-separated)
  --outdir <path>       Output directory (default: <workspace>/wechat-article/<topic-slug>)
  -h, --help            Show help

Output:
  <outdir>/00-summary.md    Auto summary (workspace mode)
  <outdir>/sources/          Copied source files
  <outdir>/01-sources.md     Merged sources view
  <outdir>/02-outline.md     Tutorial outline
  <outdir>/03-article.md     Final WeChat article
  <outdir>/04-infographics/00-cover-prompt.md  WeChat cover prompt
  <outdir>/04-infographics/prompts.md  Infographic prompts

Environment:
  WQQ_PAST_ARTICLES_DIR   Optional private history articles directory
  Env file load order: process.env > ~/.wqq-skills/.env

  If WQQ_PAST_ARTICLES_DIR is not set, past-articles step is skipped.
`);
}

async function loadEnvFile(p: string): Promise<Record<string, string>> {
  try {
    const content = await readFile(p, "utf8");
    const env: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
    return env;
  } catch {
    return {};
  }
}

async function loadEnv(): Promise<void> {
  const home = homedir();
  const homeEnv = await loadEnvFile(path.join(home, ".wqq-skills", ".env"));

  for (const [k, v] of Object.entries(homeEnv)) {
    if (!process.env[k]) process.env[k] = v;
  }
}

async function resolvePastArticlesDir(): Promise<string | null> {
  const raw = process.env.WQQ_PAST_ARTICLES_DIR?.trim();
  if (!raw) return null;

  const resolved = path.resolve(raw);

  try {
    const st = await stat(resolved);
    if (!st.isDirectory()) {
      console.error(
        `Warning: WQQ_PAST_ARTICLES_DIR is not a directory: ${resolved}`,
      );
      return null;
    }
    return resolved;
  } catch {
    console.error(`Warning: WQQ_PAST_ARTICLES_DIR not found: ${resolved}`);
    return null;
  }
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    sources: [],
    workspace: null,
    summary: null,
    outline: null,
    outdir: null,
    help: false,
  };

  const takeMany = (i: number): { items: string[]; next: number } => {
    const items: string[] = [];
    let j = i + 1;
    while (j < argv.length) {
      const v = argv[j];
      if (!v || v.startsWith("-")) break;
      items.push(v);
      j++;
    }
    return { items, next: j - 1 };
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;

    if (a === "--help" || a === "-h") {
      out.help = true;
      continue;
    }

    if (a === "--sources") {
      const { items, next } = takeMany(i);
      if (items.length === 0) throw new Error("Missing files for --sources");
      out.sources.push(...items);
      i = next;
      continue;
    }

    if (a === "--summary") {
      const v = argv[++i];
      if (!v) throw new Error("Missing value for --summary");
      out.summary = v;
      continue;
    }

    if (a === "--outline") {
      const v = argv[++i];
      if (!v) throw new Error("Missing value for --outline");
      out.outline = v;
      continue;
    }

    if (a === "--outdir") {
      const v = argv[++i];
      if (!v) throw new Error("Missing value for --outdir");
      out.outdir = v;
      continue;
    }

    if (a === "--workspace") {
      const v = argv[++i];
      if (!v) throw new Error("Missing value for --workspace");
      out.workspace = v;
      continue;
    }

    if (a.startsWith("-")) {
      throw new Error(`Unknown option: ${a}`);
    }
  }

  return out;
}

function generateTopicSlug(summary: string): string {
  // Extract 2-4 keywords from summary
  const words = summary
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 4);

  return words.join("-");
}

function generateOutputDir(
  summary: string,
  baseOutdir: string | null,
  workspace: string,
): string {
  const slug = generateTopicSlug(summary);
  const base = baseOutdir
    ? path.resolve(baseOutdir)
    : path.join(workspace, "wechat-article", slug);

  // Check if exists, add timestamp if needed
  try {
    const stat = Bun.file(base);
    if (stat.size >= 0) {
      const timestamp = new Date()
        .toISOString()
        .replace(/[-:]/g, "")
        .split(".")[0];
      return `${base}-${timestamp}`;
    }
  } catch {
    // Directory doesn't exist, use base
  }

  return base;
}

async function parseSourceFile(filePath: string): Promise<Source> {
  const content = await readFile(filePath, "utf8");

  // Parse YAML frontmatter
  const yamlMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
  let metadata: SourceMetadata = { title: path.basename(filePath, ".md") };
  let body = content;

  if (yamlMatch) {
    const yamlContent = yamlMatch[1];
    const lines = yamlContent?.split("\n") || [];

    for (const line of lines) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;

      const key = line.slice(0, colonIdx).trim().toLowerCase();
      const value = line.slice(colonIdx + 1).trim();

      if (key === "title") metadata.title = value;
      else if (key === "url") metadata.url = value;
      else if (key === "author") metadata.author = value;
      else if (key === "date") metadata.date = value;
    }

    body = content.slice(yamlMatch[0].length);
  }

  return { metadata, content: body.trim() };
}

function toSourceFromNormalized(normalized: NormalizedSource): Source {
  return {
    metadata: {
      title: normalized.metadata.title,
      url: normalized.metadata.url,
      author: normalized.metadata.author,
      date: normalized.metadata.date,
    },
    content: normalized.body,
  };
}

function toNormalizedSourceMarkdown(normalized: NormalizedSource): string {
  const lines: string[] = [
    "---",
    `title: ${JSON.stringify(normalized.metadata.title)}`,
    `source_path: ${JSON.stringify(normalized.metadata.source_path)}`,
    `ingested_at: ${JSON.stringify(normalized.metadata.ingested_at)}`,
  ];

  const tags = normalized.metadata.tags;
  if (tags.length === 0) {
    lines.push("tags: []");
  } else {
    lines.push(`tags: [${tags.map((tag) => JSON.stringify(tag)).join(", ")}]`);
  }

  if (normalized.metadata.url) {
    lines.push(`url: ${JSON.stringify(normalized.metadata.url)}`);
  }
  if (normalized.metadata.author) {
    lines.push(`author: ${JSON.stringify(normalized.metadata.author)}`);
  }
  if (normalized.metadata.date) {
    lines.push(`date: ${JSON.stringify(normalized.metadata.date)}`);
  }

  lines.push("---", "", normalized.body);
  return lines.join("\n");
}

function renderSummaryMd(summary: AutoSummary): string {
  const parts: string[] = ["# 素材自动总结", "", "## 一句话总结", "", summary.oneLiner];

  parts.push("", "## 建议提纲", "");
  for (const point of summary.outline) {
    parts.push(`- ${point}`);
  }

  return parts.join("\n");
}

async function generateMergedSources(sources: Source[]): Promise<string> {
  const parts: string[] = ["# 素材汇总\n"];

  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    if (!src) continue;

    parts.push(`## 素材 ${i + 1}: ${src.metadata.title}\n`);

    if (src.metadata.url) parts.push(`- 来源: ${src.metadata.url}`);
    if (src.metadata.author) parts.push(`- 作者: ${src.metadata.author}`);
    if (src.metadata.date) parts.push(`- 日期: ${src.metadata.date}`);

    parts.push("\n---\n");
    parts.push(src.content);
    parts.push("\n\n");
  }

  parts.push("## 来源链接清单\n");
  for (const src of sources) {
    if (src.metadata.url) {
      parts.push(`- [${src.metadata.title}](${src.metadata.url})`);
    }
  }

  return parts.join("\n");
}

async function generateOutline(
  summary: string,
  outline: string | null,
  sources: Source[],
): Promise<string> {
  const parts: string[] = ["# 文章大纲\n"];

  parts.push(`## 一句话总结\n\n${summary}\n`);

  if (outline) {
    parts.push("\n## 要点\n");
    const points = outline.split(",").map((p) => p.trim());
    for (const point of points) {
      parts.push(`- ${point}`);
    }
  }

  parts.push("\n## 建议结构\n");
  parts.push("1. 一句话总结");
  parts.push("2. 你将学到什么");
  parts.push("3. 适用场景");
  parts.push("4. 前置条件");
  parts.push("5. 核心步骤");
  parts.push("6. 常见问题/排错");
  parts.push("7. 总结");
  parts.push("8. 参考链接");

  return parts.join("\n");
}

async function generateArticle(
  summary: string,
  outline: string | null,
  sources: Source[],
): Promise<string> {
  // This is a placeholder - in real workflow, Claude agent would fill this
  const parts: string[] = [];

  parts.push(`# ${summary}\n`);
  parts.push("## 一句话总结\n");
  parts.push(`${summary}\n`);
  parts.push("\n## 你将学到什么\n");

  if (outline) {
    const points = outline.split(",").map((p) => p.trim());
    for (const point of points) {
      parts.push(`- ${point}`);
    }
  } else {
    parts.push("- TODO: 填写学习要点");
  }

  parts.push("\n## 核心步骤\n");
  parts.push("TODO: 根据 01-sources.md 和 02-outline.md，按教程模板填写\n");

  parts.push("\n## 参考链接\n");
  for (const src of sources) {
    if (src.metadata.url) {
      parts.push(`- [${src.metadata.title}](${src.metadata.url})`);
    }
  }

  return parts.join("\n");
}

async function generateInfographicPrompts(summary: string): Promise<string> {
  const parts: string[] = ["# 信息图生成提示词\n"];

  parts.push("## 建议配图位置\n");
  parts.push("1. 整体流程图/架构图");
  parts.push("2. 核心步骤汇总卡片");
  parts.push("3. 关键对比(Do/Don't)");
  parts.push("4. 常见坑与排错流程\n");

  parts.push("## 配图 1: 整体流程图\n");
  parts.push('**位置**: 文章开头，"核心步骤"章节前');
  parts.push("**目的**: 让读者快速了解整体流程");
  parts.push("**比例**: 1:1 或 9:16");
  parts.push("**Prompt**:\n");
  parts.push("```");
  parts.push(`Create a clean infographic flowchart about "${summary}". `);
  parts.push("Use simple icons, arrows, and Chinese labels. ");
  parts.push("Modern flat design, tech style, white background.");
  parts.push("```\n");

  parts.push("## 配图 2: 核心步骤卡片\n");
  parts.push('**位置**: "核心步骤"章节内');
  parts.push("**目的**: 总结关键步骤");
  parts.push("**比例**: 1:1");
  parts.push("**Prompt**:\n");
  parts.push("```");
  parts.push("Create a checklist-style infographic card. ");
  parts.push("List 3-5 key steps with checkboxes. ");
  parts.push("Use Chinese text, clean layout, pastel colors.");
  parts.push("```\n");

  parts.push("## 生成命令示例\n");
  parts.push("```bash");
  parts.push(
    '/wqq-image-gen --prompt "..." --image 04-infographics/01-flowchart.png --ar 1:1',
  );
  parts.push("```");

  return parts.join("\n");
}

async function generateCoverPrompt(summary: string): Promise<string> {
  const parts: string[] = ["# WeChat Cover Prompt (Dual Crop)\n"];

  parts.push("## Purpose\n");
  parts.push(`Create one WeChat cover image for: ${summary}`);
  parts.push("The same image must support both 1:1 and 2.35:1 crops.\n");

  parts.push("## Hard Constraints\n");
  parts.push("- Canvas ratio: 2.35:1 (recommended 2350x1000 or larger)");
  parts.push(
    "- Center safe area: 1:1 square, centered, width = 42.55% of total width",
  );
  parts.push(
    "- Left and right side areas (28.72% each) are for background extension only",
  );
  parts.push(
    "- All critical elements must stay in safe area: title, main subject, brand mark",
  );
  parts.push("- Keep title short (<= 12 Chinese characters) and high contrast\n");

  parts.push("## Prompt (English)\n");
  parts.push("```");
  parts.push("Create a WeChat article cover image that supports dual crop.");
  parts.push("Canvas ratio: 2.35:1 landscape.");
  parts.push(
    "Critical safe area: centered 1:1 square occupying 42.55% of canvas width.",
  );
  parts.push(
    "Place ALL key elements inside the safe area: main subject, title, logo.",
  );
  parts.push("Use side areas only for background extension and atmosphere.");
  parts.push(
    "Readable at small size, high contrast, minimal text, no watermark, no busy background.",
  );
  parts.push("```");

  parts.push("\n## Generation Command\n");
  parts.push("```bash");
  parts.push(
    '/wqq-image-gen --prompt "..." --image 04-infographics/00-cover-<slug>.png --ar 2.35:1',
  );
  parts.push("# Fallback if model rejects 2.35:1");
  parts.push(
    '/wqq-image-gen --prompt "..." --image 04-infographics/00-cover-<slug>.png --ar 21:9',
  );
  parts.push("```");

  return parts.join("\n");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    return;
  }

  await loadEnv();
  const pastArticlesDir = await resolvePastArticlesDir();

  if (args.workspace && args.sources.length > 0) {
    throw new Error("--workspace and --sources cannot be used together");
  }

  if (pastArticlesDir) {
    console.log(`ℹ Past articles directory: ${pastArticlesDir}`);
  } else {
    console.log(
      "ℹ Past articles directory: skipped (set WQQ_PAST_ARTICLES_DIR to enable)",
    );
  }

  const workspace = path.resolve(args.workspace || process.cwd());
  let sources: Source[] = [];
  let summary = args.summary;
  let outline = args.outline;
  let workspaceSources: NormalizedSource[] | null = null;
  let autoSummary: AutoSummary | null = null;

  if (args.sources.length > 0) {
    for (const srcPath of args.sources) {
      const source = await parseSourceFile(srcPath);
      sources.push(source);
    }

    if (!summary) {
      console.error("Error: --summary is required in --sources mode");
      printUsage();
      process.exitCode = 1;
      return;
    }
  } else {
    const ingestResult = await ingestWorkspace(workspace);
    workspaceSources = ingestResult.sources;
    autoSummary = ingestResult.summary;
    sources = workspaceSources.map(toSourceFromNormalized);
    summary = autoSummary.oneLiner;
    if (!outline) outline = autoSummary.outline.join(",");
  }

  if (!summary) {
    console.error("Error: summary is required");
    printUsage();
    process.exitCode = 1;
    return;
  }

  const outdir = generateOutputDir(summary, args.outdir, workspace);
  await mkdir(outdir, { recursive: true });
  await mkdir(path.join(outdir, "sources"), { recursive: true });
  await mkdir(path.join(outdir, "04-infographics"), { recursive: true });

  if (workspaceSources) {
    for (let i = 0; i < workspaceSources.length; i++) {
      const source = workspaceSources[i];
      if (!source) continue;

      const basename = path.basename(
        source.metadata.source_path,
        path.extname(source.metadata.source_path),
      );
      const destPath = path.join(
        outdir,
        "sources",
        `${String(i + 1).padStart(2, "0")}-${basename}.md`,
      );
      await writeFile(destPath, toNormalizedSourceMarkdown(source));
    }

    if (autoSummary) {
      await writeFile(path.join(outdir, "00-summary.md"), renderSummaryMd(autoSummary));
    }
  } else {
    for (let i = 0; i < args.sources.length; i++) {
      const srcPath = args.sources[i];
      if (!srcPath) continue;
      const content = await readFile(srcPath, "utf8");
      const basename = path.basename(srcPath);
      const destPath = path.join(
        outdir,
        "sources",
        `${String(i + 1).padStart(2, "0")}-${basename}`,
      );
      await writeFile(destPath, content);
    }
  }

  // Generate 01-sources.md
  const mergedSources = await generateMergedSources(sources);
  await writeFile(path.join(outdir, "01-sources.md"), mergedSources);

  // Generate 02-outline.md
  const outlineContent = await generateOutline(summary, outline, sources);
  await writeFile(path.join(outdir, "02-outline.md"), outlineContent);

  // Generate 03-article.md (placeholder)
  const articleContent = await generateArticle(summary, outline, sources);
  await writeFile(path.join(outdir, "03-article.md"), articleContent);

  // Generate 04-infographics/00-cover-prompt.md
  const coverPromptContent = await generateCoverPrompt(summary);
  await writeFile(
    path.join(outdir, "04-infographics", "00-cover-prompt.md"),
    coverPromptContent,
  );

  // Generate 04-infographics/prompts.md
  const promptsContent = await generateInfographicPrompts(summary);
  await writeFile(
    path.join(outdir, "04-infographics", "prompts.md"),
    promptsContent,
  );

  console.log(`✓ Created article structure in: ${outdir}`);
  console.log(`✓ Files generated:`);
  if (autoSummary) {
    console.log(`  - 00-summary.md`);
  }
  console.log(`  - 01-sources.md`);
  console.log(`  - 02-outline.md`);
  console.log(`  - 03-article.md (TODO: complete with tutorial content)`);
  console.log(`  - 04-infographics/00-cover-prompt.md`);
  console.log(`  - 04-infographics/prompts.md`);
  console.log(`\nNext steps:`);
  console.log(
    `1. Review and complete 03-article.md based on tutorial template`,
  );
  console.log(
    `2. Generate infographics: /wqq-image-gen --prompt "..." --image <path>`,
  );
}

main().catch((e) => {
  console.error(`Error: ${formatError(e)}`);

  // Additional debugging info for common errors
  if (e instanceof Error) {
    if (e.message.includes("ENOENT") || e.message.includes("not found")) {
      console.error("\nTip: Check that all source files exist");
      console.error("Example: --sources sources/*.md");
    } else if (
      e.message.includes("YAML") ||
      e.message.includes("frontmatter")
    ) {
      console.error("\nTip: Check YAML frontmatter format in source files");
    }
  }

  process.exit(1);
});
