# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

个人 Claude Code 技能集合（X/Twitter、WeChat、YouTube 等）。

## 原则

- 工作流定义在 `SKILL.md` + `references/` 中。
- 确定性操作在 `scripts/*.ts` 中，通过 Bun 执行。
- MVP 阶段不引入外部 npm 依赖（仅使用 Bun 运行时）。
- 每个 skill 完全自包含，所有源码在 `skills/<name>/scripts/` 目录内。

## 常用命令

```bash
# 类型检查
bun run typecheck

# 运行所有测试
bun run test

# 运行单个测试文件
bun test skills/x-bookmarks/scripts/markdown.test.ts

# 运行某个 skill 的所有测试
bun test skills/x-bookmarks/scripts/

# 运行脚本
npx -y bun skills/<skill>/scripts/main.ts --help
```

注意：`package.json` 的 `test` 脚本仅覆盖 `x-bookmarks` 和 `x-to-md`。wqq-wechat-article 测试需单独运行：`bun test skills/wqq-wechat-article/scripts/`。

### Python skill (yt-monitor)

```bash
uv sync --project skills/yt-monitor --extra transcribe
uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py list
uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_subtitle_dl.py download "URL"
```

## 架构

### x-bookmarks 与 x-to-md 共享代码

这两个 skill 有约 40 个相同的 TypeScript 模块（实际文件副本，非 symlink），包括 `cookies`、`chrome-login`、`http`、`graphql`、`markdown`、`media-localizer`、`tweet-utils` 等。修改共享模块时**必须同步更新两份**。部分文件已有细微差异（如 `graphql.ts`），修改前先 diff 确认。

- x-bookmarks 独有：`bookmarks-api`、`bookmarks-parser`、`state`、`summary`、`tweet-detail`、`debug`
- x-to-md 独有：`summarize`

### wqq-wechat-article 的 references 机制

`references/` 目录包含写作风格、合规规则、模板等。SKILL.md 要求在生成内容前**必须先读取** `style-guide.md` 和 `compliance.md`。

### yt-monitor（Python）

使用 `uv` 管理依赖（非 pip/poetry），核心依赖 `yt-dlp`，可选 `mlx-whisper`（Apple Silicon 转录）。运行时数据存放在 `~/.wqq-skills/yt-monitor/`。

### OpenSpec 工作流

`openspec/` 目录用于 spec-driven 的变更管理。通过 `/opsx:explore`、`/opsx:propose`、`/opsx:apply`、`/opsx:archive` 命令驱动。`openspec/config.yaml` 要求所有产出物用简体中文撰写。

## 密钥管理

- API 密钥放在 `$HOME/.wqq-skills/.env`。
- 不要提交密钥；`.wqq-skills/` 已被 gitignore。
- 仅从文件读取的密钥：`OPENAI_API_KEY`、`OPENAI_BASE_URL`。
- X 认证：`X_AUTH_TOKEN`、`X_CT0`（或通过 `python3` + `browser_cookie3` 自动从 Chrome 读取 cookies）。
