---
name: wqq-x-to-md
description: Use when the user provides one or more X/Twitter status URLs and wants local Markdown export with media download and Chinese summary.
---

# WQQ X to Markdown

目标：将 `x.com/.../status/...` 链接批量导出为本地 Markdown，下载媒体到本地目录，保留原文内容并自动生成中文摘要。

## Prerequisites

- 无需 X 登录态（使用 fxtwitter 公共 API）
- OpenAI 摘要配置
  - `OPENAI_API_KEY` / `OPENAI_BASE_URL` 从 `~/.wqq-skills/.env` 读取（`OPENAI_BASE_URL` 默认 `https://api.openai.com/v1`）
  - 可选：`OPENAI_MODEL`（默认 `gpt-4o-mini`，可用环境变量覆盖）

## Usage

```bash
npx -y bun skills/wqq-x-to-md/scripts/main.ts \
  --urls \
  https://x.com/elvissun/status/2025920521871716562 \
  https://x.com/wangzan101/status/2025948108098854969
```

常用参数：

```bash
npx -y bun skills/wqq-x-to-md/scripts/main.ts \
  --urls https://x.com/<user>/status/<id> \
  --output /tmp/x-to-md

npx -y bun skills/wqq-x-to-md/scripts/main.ts \
  --urls https://x.com/<user>/status/<id> \
  --no-download-media
```

## Behavior

- 输入必须是 `x.com` / `twitter.com` 的 status URL（也支持直接 tweet id）
- 已存在 `<tweetId>.md` 时自动 skip
- 单条失败不中断整体
- 保留原文内容，自动生成中文摘要（写入 frontmatter `summary` 字段 + 正文开头引用块）
- 保留 Markdown 结构、frontmatter、代码块、行内代码、链接和本地媒体路径

## Output

目录结构与 `wqq-x-bookmarks` 保持一致：

```text
<output>/<YYYYMMDD-HHmmss-标题-作者-id>/<tweetId>.md
<output>/<YYYYMMDD-HHmmss-标题-作者-id>/imgs/*
<output>/<YYYYMMDD-HHmmss-标题-作者-id>/videos/*
```
