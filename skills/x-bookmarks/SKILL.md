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

## Step 1: 确认导出参数

在执行任何命令前，先用 AskUserQuestion 向用户确认以下选项：

1. **导出范围**：全部书签（--all）还是指定数量？
2. **是否生成汇总 SUMMARY.md**（--with-summary）？
3. **是否下载媒体文件**（默认下载，--no-download-media 跳过）？

根据用户回答拼接命令参数。如果用户的原始指令已经明确了所有选项（如"导出全部书签带总结"），可以跳过对应问题。

## Step 2: debug 认证验证（仅首次或异常时）

```bash
npx -y bun skills/x-bookmarks/scripts/debug.ts --count 5 --save-raw
```

说明：
- 输出 `tweetIds` 和 `nextCursor`
- `--save-raw` 会保存原始 JSON，便于排查结构变化
- 如果返回 401/403，说明 cookie 失效，需要刷新认证信息

> 日常导出可以直接跳到 Step 3。`debug.ts` 主要用于首次接入和异常排查。

## Step 3: 执行导出链路

根据 Step 1 确认的参数执行：

```bash
npx -y bun skills/x-bookmarks/scripts/main.ts [参数]
```

常用参数组合：

```bash
# 默认 50 条
npx -y bun skills/x-bookmarks/scripts/main.ts

# 指定数量
npx -y bun skills/x-bookmarks/scripts/main.ts --limit 10

# 全部书签 + 汇总
npx -y bun skills/x-bookmarks/scripts/main.ts --all --with-summary

# 全部书签，不下载媒体
npx -y bun skills/x-bookmarks/scripts/main.ts --all --no-download-media

# 自定义输出目录
npx -y bun skills/x-bookmarks/scripts/main.ts --output /tmp/wqq-x-bookmarks-demo
```

`--with-summary` 说明：
- OpenAI 配置从 `~/.wqq-skills/.env` 读取：
  - `OPENAI_API_KEY`（必填）
  - `OPENAI_BASE_URL`（可选，默认 `https://api.openai.com/v1`）
- 可选 `OPENAI_MODEL`（默认 `gpt-4o-mini`）
- 若 OpenAI 请求失败或返回格式异常，会自动回退到规则摘要，不中断导出
- 若缺少 `OPENAI_API_KEY`，会直接报错并中止 summary 生成

## 断点续传

脚本在 output 目录维护 `exported-ids.json` 状态文件，记录已导出的 tweet ID 和上次分页 cursor。

- `--all` 模式下，中断后重跑自动跳过已导出内容，从上次位置继续
- 每条推文导出间隔 3-5 秒，分页间隔 2-4 秒，避免触发限流
- 遇到 429 限流会自动读取 `x-rate-limit-reset` header 精确等待
- 如需完全重新导出，删除 `exported-ids.json` 即可

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
