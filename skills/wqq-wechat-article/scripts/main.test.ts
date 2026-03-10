import { describe, expect, it } from "bun:test";
import path from "node:path";
import { mkdtemp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

type RunResult = {
  code: number;
  stdout: string;
  stderr: string;
};

function buildEnv(
  overrides: Record<string, string | undefined> = {},
): Record<string, string> {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") env[key] = value;
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete env[key];
      continue;
    }
    env[key] = value;
  }

  return env;
}

async function runArticleCli(
  args: string[],
  cwd: string,
  envOverrides: Record<string, string | undefined> = {},
): Promise<RunResult> {
  const scriptPath = path.resolve(import.meta.dir, "main.ts");

  const proc = Bun.spawn(["bun", scriptPath, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: buildEnv(envOverrides),
  });

  const code = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();

  return { code, stdout, stderr };
}

function extractOutdir(output: string): string {
  const match = output.match(/Created article structure in: (.+)/);
  if (!match?.[1]) {
    throw new Error(`Failed to parse output directory from: ${output}`);
  }
  return match[1].trim();
}

async function exists(p: string): Promise<boolean> {
  try {
    await readFile(p, "utf8");
    return true;
  } catch {
    return false;
  }
}

describe("wqq-wechat-article CLI", () => {
  it("uses cwd as workspace when --workspace is absent", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "wechat-article-test-"));
    await mkdir(path.join(workspace, "refs", "nested"), { recursive: true });
    await writeFile(
      path.join(workspace, "refs", "nested", "note.md"),
      "# 标题\n正文",
      "utf8",
    );

    const result = await runArticleCli([], workspace, {
      WQQ_PAST_ARTICLES_DIR: undefined,
    });

    expect(result.code).toBe(0);
    const outdir = extractOutdir(`${result.stdout}\n${result.stderr}`);
    expect(await exists(path.join(outdir, "00-summary.md"))).toBeTrue();
  });

  it("uses --workspace directory when provided", async () => {
    const caller = await mkdtemp(path.join(tmpdir(), "wechat-article-caller-"));
    const target = await mkdtemp(path.join(tmpdir(), "wechat-article-workspace-"));
    await writeFile(path.join(target, "source.txt"), "纯文本素材", "utf8");

    const result = await runArticleCli(["--workspace", target], caller);
    expect(result.code).toBe(0);
    const outdir = extractOutdir(`${result.stdout}\n${result.stderr}`);
    expect(outdir.startsWith(path.join(target, "wechat-article"))).toBeTrue();
  });

  it("rejects using --workspace with --sources together", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "wechat-article-test-"));
    const sourceFile = path.join(workspace, "01.md");
    await writeFile(sourceFile, "# t\nbody", "utf8");

    const result = await runArticleCli(
      ["--workspace", workspace, "--sources", sourceFile],
      workspace,
    );

    expect(result.code).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      "--workspace and --sources cannot be used together",
    );
  });

  it("creates 00-summary.md and standard sources in workspace mode", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "wechat-article-workspace-"));
    const caller = await mkdtemp(path.join(tmpdir(), "wechat-article-caller-"));
    await mkdir(path.join(workspace, "refs"), { recursive: true });
    await writeFile(path.join(workspace, "refs", "a.md"), "# 标题A\n正文A", "utf8");
    await writeFile(path.join(workspace, "refs", "b.txt"), "纯文本B", "utf8");

    const result = await runArticleCli(["--workspace", workspace], caller, {
      WQQ_PAST_ARTICLES_DIR: undefined,
    });

    expect(result.code).toBe(0);
    const outdir = extractOutdir(`${result.stdout}\n${result.stderr}`);
    expect(await exists(path.join(outdir, "00-summary.md"))).toBeTrue();
    expect(await exists(path.join(outdir, "01-sources.md"))).toBeTrue();

    const sourceDir = path.join(outdir, "sources");
    const sourceFiles = (await readdir(sourceDir))
      .filter((name) => name.endsWith(".md"))
      .sort();
    expect(sourceFiles.length).toBeGreaterThan(0);

    for (const file of sourceFiles) {
      const content = await readFile(path.join(sourceDir, file), "utf8");
      expect(content).toContain("title:");
      expect(content).toContain("source_path:");
      expect(content).toContain("ingested_at:");
      expect(content).toContain("tags:");
    }
  });

  it("generates dual-crop cover prompt file", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "wechat-article-test-"));
    const sourcesDir = path.join(workspace, "sources");
    await mkdir(sourcesDir, { recursive: true });

    const sourceFile = path.join(sourcesDir, "01-source-demo.md");
    await writeFile(
      sourceFile,
      [
        "---",
        "title: Demo Source",
        "url: https://example.com/demo",
        "---",
        "",
        "Demo content.",
      ].join("\n"),
      "utf8",
    );

    const requestedOutdir = path.join(workspace, "article-output");
    const result = await runArticleCli(
      [
        "--sources",
        sourceFile,
        "--summary",
        "公众号封面双裁切规范",
        "--outdir",
        requestedOutdir,
      ],
      workspace,
    );

    expect(result.code).toBe(0);

    const allOutput = `${result.stdout}\n${result.stderr}`;
    const actualOutdir = extractOutdir(allOutput);
    const coverPromptPath = path.join(
      actualOutdir,
      "04-infographics",
      "00-cover-prompt.md",
    );
    const coverPrompt = await readFile(coverPromptPath, "utf8");

    expect(coverPrompt).toContain("2.35:1");
    expect(coverPrompt).toContain("1:1");
    expect(coverPrompt).toContain("42.55%");
  });

  it("skips past articles when env is not configured", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "wechat-article-test-"));
    const sourcesDir = path.join(workspace, "sources");
    await mkdir(sourcesDir, { recursive: true });

    const sourceFile = path.join(sourcesDir, "01-source-demo.md");
    await writeFile(
      sourceFile,
      [
        "---",
        "title: Demo Source",
        "url: https://example.com/demo",
        "---",
        "",
        "Demo content.",
      ].join("\n"),
      "utf8",
    );

    const requestedOutdir = path.join(workspace, "article-output");
    const result = await runArticleCli(
      [
        "--sources",
        sourceFile,
        "--summary",
        "未配置历史文章目录",
        "--outdir",
        requestedOutdir,
      ],
      workspace,
      { WQQ_PAST_ARTICLES_DIR: undefined },
    );

    expect(result.code).toBe(0);
    const allOutput = `${result.stdout}\n${result.stderr}`;
    expect(allOutput).toContain("Past articles directory: skipped");
  });

  it("loads past articles directory from ~/.wqq-skills/.env", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "wechat-article-test-"));
    const fakeHome = await mkdtemp(path.join(tmpdir(), "wechat-article-home-"));

    const sourcesDir = path.join(workspace, "sources");
    await mkdir(sourcesDir, { recursive: true });

    const sourceFile = path.join(sourcesDir, "01-source-demo.md");
    await writeFile(
      sourceFile,
      [
        "---",
        "title: Demo Source",
        "url: https://example.com/demo",
        "---",
        "",
        "Demo content.",
      ].join("\n"),
      "utf8",
    );

    const pastArticlesDir = path.join(fakeHome, "private-past-articles");
    await mkdir(pastArticlesDir, { recursive: true });

    const envDir = path.join(fakeHome, ".wqq-skills");
    await mkdir(envDir, { recursive: true });
    await writeFile(
      path.join(envDir, ".env"),
      `WQQ_PAST_ARTICLES_DIR=${pastArticlesDir}\n`,
      "utf8",
    );

    const requestedOutdir = path.join(workspace, "article-output");
    const result = await runArticleCli(
      [
        "--sources",
        sourceFile,
        "--summary",
        "从env读取历史文章目录",
        "--outdir",
        requestedOutdir,
      ],
      workspace,
      {
        HOME: fakeHome,
        WQQ_PAST_ARTICLES_DIR: undefined,
      },
    );

    expect(result.code).toBe(0);
    const allOutput = `${result.stdout}\n${result.stderr}`;
    expect(allOutput).toContain(
      `Past articles directory: ${path.resolve(pastArticlesDir)}`,
    );
  });

  it("keeps legacy --sources mode working", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "wechat-article-test-"));
    const sourceFile = path.join(workspace, "legacy.md");
    await writeFile(
      sourceFile,
      ["---", "title: Legacy Source", "---", "", "Legacy content"].join("\n"),
      "utf8",
    );

    const result = await runArticleCli(
      ["--sources", sourceFile, "--summary", "legacy mode works"],
      workspace,
    );

    expect(result.code).toBe(0);
    const outdir = extractOutdir(`${result.stdout}\n${result.stderr}`);
    expect(await exists(path.join(outdir, "01-sources.md"))).toBeTrue();
    expect(await exists(path.join(outdir, "02-outline.md"))).toBeTrue();
    expect(await exists(path.join(outdir, "03-article.md"))).toBeTrue();
    expect(
      await exists(path.join(outdir, "04-infographics", "00-cover-prompt.md")),
    ).toBeTrue();
  });
});
