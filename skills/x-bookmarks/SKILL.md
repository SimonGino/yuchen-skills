---
name: wqq-x-bookmarks
description: 导出 X 书签到 Markdown，支持 debug 认证验证、分页抓取、媒体下载与重复导出 skip。
---

# WQQ X Bookmarks Workflow

目标：将 X 书签导出为本地 Markdown，目录命名为 `YYYYMMDD-HHmmss-标题-作者-id`，重复执行自动跳过已导出内容，并可选生成汇总 `SUMMARY.md`。

## Prerequisites

- 推荐使用环境变量：
  - `X_AUTH_TOKEN`
  - `X_CT0`
- 如果没有传，脚本会尝试读取本机 Chrome cookie（依赖 `python3` + `browser_cookie3`）。

## Step 1: 先做 debug 认证验证

```bash
npx -y bun skills/wqq-x-bookmarks/scripts/debug.ts --count 5 --save-raw
```

说明：
- 输出 `tweetIds` 和 `nextCursor`
- `--save-raw` 会保存原始 JSON，便于排查结构变化
- 如果返回 401/403，说明 cookie 失效，需要刷新认证信息

> 日常导出可以直接跳到 Step 2。`debug.ts` 主要用于首次接入和异常排查。

## Step 2: 执行导出链路

默认行为：
- 默认 `--limit 50`
- 默认下载媒体（不传 `--no-download-media`）
- 单条失败不中断整体
- 已存在 `<tweetId>.md` 自动 skip
- 可选 `--with-summary` 同步生成汇总文档（AI 三段式）

```bash
npx -y bun skills/wqq-x-bookmarks/scripts/main.ts
```

常用参数：

```bash
npx -y bun skills/wqq-x-bookmarks/scripts/main.ts --limit 10
npx -y bun skills/wqq-x-bookmarks/scripts/main.ts --output /tmp/wqq-x-bookmarks-demo
npx -y bun skills/wqq-x-bookmarks/scripts/main.ts --no-download-media
npx -y bun skills/wqq-x-bookmarks/scripts/main.ts --limit 10 --with-summary
```

`--with-summary` 说明：
- OpenAI 配置从 `~/.wqq-skills/.env` 读取：
  - `OPENAI_API_KEY`（必填）
  - `OPENAI_BASE_URL`（可选，默认 `https://api.openai.com/v1`）
- 可选 `OPENAI_MODEL`（默认 `gpt-4o-mini`）
- 若 OpenAI 请求失败或返回格式异常，会自动回退到规则摘要，不中断导出
- 若缺少 `OPENAI_API_KEY`，会直接报错并中止 summary 生成

## Output

```text
<output>/SUMMARY.md                         # only when --with-summary
<output>/<YYYYMMDD-HHmmss-标题-作者-id>/<tweetId>.md
<output>/<YYYYMMDD-HHmmss-标题-作者-id>/imgs/*
<output>/<YYYYMMDD-HHmmss-标题-作者-id>/videos/*
```

命令结束会输出汇总：
- `success`
- `skipped`
- `failed`
