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
bun test skills/x-toolkit/scripts/common/markdown.test.ts

# 运行某个 skill 的所有测试
bun test skills/x-toolkit/scripts/

# 运行脚本
npx -y bun skills/x-toolkit/scripts/main.ts --mode bookmarks --limit 10
```

注意：`package.json` 的 `test` 脚本目前仅覆盖 `x-toolkit`。wqq-wechat-article 测试需单独运行：`bun test skills/wqq-wechat-article/scripts/`。

### Python skill (yt-monitor)

```bash
uv sync --project skills/yt-monitor --extra transcribe
uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py list
uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_subtitle_dl.py download "URL"
```

## 架构

### x-toolkit 目录结构

X/Twitter 相关能力已合并到 `skills/x-toolkit/`：

- `scripts/common/`：共享模块（`cookies`、`chrome-login`、`http`、`graphql`、`markdown`、`media-localizer`、`manifest`、`tweet-utils` 等）
- `scripts/bookmarks/`：书签导出独有模块（`bookmarks-api`、`bookmarks-parser`、`state`、`tweet-detail`、`debug`）
- `scripts/export/`：URL 推文导出独有模块（导出入口）
- `scripts/main.ts`：统一入口；有 `--urls` 时走推文导出，否则走书签/Debug 模式
- `references/categories.yaml`：推文分类标签体系（富化流程使用）

共享模块只维护一份，修改时直接更新 `scripts/common/`。

### wqq-wechat-article 的 references 机制

`references/` 目录包含写作风格、合规规则、模板等。SKILL.md 要求在生成内容前**必须先读取** `style-guide.md` 和 `compliance.md`。

### yt-monitor（Python）

使用 `uv` 管理依赖（非 pip/poetry），核心依赖 `yt-dlp`，需要 `deno`（JS challenge）和 Chrome 登录 YouTube（cookie 认证）。`mlx-whisper` 对中文频道为必需品（首次使用时自动安装，仅 Apple Silicon）。运行时数据存放在 `~/.wqq-skills/yt-monitor/`。

### OpenSpec 工作流

`openspec/` 目录用于 spec-driven 的变更管理。通过 `/opsx:explore`、`/opsx:propose`、`/opsx:apply`、`/opsx:archive` 命令驱动。`openspec/config.yaml` 要求所有产出物用简体中文撰写。

## 密钥管理

- API 密钥放在 `$HOME/.wqq-skills/.env`。
- 不要提交密钥；`.wqq-skills/` 已被 gitignore。
- 仅从文件读取的密钥：`OPENAI_API_KEY`、`OPENAI_BASE_URL`（wqq-wechat-article 使用；x-toolkit 已不再需要）。
- X 认证：`X_AUTH_TOKEN`、`X_CT0`（或通过 `python3` + `browser_cookie3` 自动从 Chrome 读取 cookies）。
