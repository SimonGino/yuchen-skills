---
name: wqq-x-toolkit
description: 导出 X 书签或将指定 X/Twitter status URLs 导出为 Markdown，支持 debug 认证验证、媒体下载与中文摘要。
---

# WQQ X Toolkit Workflow

统一处理两类 X/Twitter 导出任务：
- 书签导出：分页抓取、游标恢复、重复导出 skip、可选生成 `SUMMARY.md`
- 推文导出：将一个或多个 status URL 导出为本地 Markdown，下载媒体并生成中文摘要

## Prerequisites

- 书签模式需要 X 登录态：
  - 推荐环境变量：`X_AUTH_TOKEN`、`X_CT0`
  - 若未提供，脚本会尝试读取本机 Chrome cookie（依赖 `python3` + `browser_cookie3`）
- 推文导出模式无需 X 登录态（使用 fxtwitter 公共 API）
- OpenAI 摘要配置从 `~/.wqq-skills/.env` 读取：
  - `OPENAI_API_KEY`
  - 可选：`OPENAI_BASE_URL`、`OPENAI_MODEL`、`OPENAI_API_FORMAT`

## Step 1: 确定模式

- 用户提供一个或多个 `x.com/.../status/...` / `twitter.com/.../status/...` URL：
  - 直接进入推文导出模式
- 用户明确提到「导出 X 书签」「X bookmarks」等：
  - 进入书签导出模式
- 用户明确提到认证异常、cookie、debug、排查登录态：
  - 进入 Debug 认证模式
- 若没有 URL，且用户意图不够明确：
  - 使用 AskUserQuestion 提供两个选项：
    - `导出书签`
    - `Debug 认证`

## Step 2A: 书签导出模式

在执行命令前，先用 AskUserQuestion 确认这些参数：

1. 导出范围：全部书签（`--all`）还是指定数量（`--limit <n>`）
2. 是否生成汇总 `SUMMARY.md`（`--with-summary`）
3. 是否下载媒体文件（默认下载，`--no-download-media` 跳过）

若用户原始指令已经明确了这些选项，可跳过对应问题。

执行命令：

```bash
npx -y bun skills/x-toolkit/scripts/main.ts --mode bookmarks [参数]
```

常用示例：

```bash
# 默认 50 条
npx -y bun skills/x-toolkit/scripts/main.ts --mode bookmarks

# 指定数量
npx -y bun skills/x-toolkit/scripts/main.ts --mode bookmarks --limit 10

# 全部书签 + 汇总
npx -y bun skills/x-toolkit/scripts/main.ts --mode bookmarks --all --with-summary

# 全部书签，不下载媒体
npx -y bun skills/x-toolkit/scripts/main.ts --mode bookmarks --all --no-download-media
```

## Step 2B: 推文导出模式

执行命令：

```bash
npx -y bun skills/x-toolkit/scripts/main.ts --urls <url1> <url2> ...
```

常用示例：

```bash
npx -y bun skills/x-toolkit/scripts/main.ts \
  --urls https://x.com/<user>/status/<tweet_id>

npx -y bun skills/x-toolkit/scripts/main.ts \
  --urls https://x.com/<user>/status/<tweet_id> \
  --no-download-media
```

行为：
- 输入支持 `x.com` / `twitter.com` status URL，也支持直接 tweet id
- 已存在 `<tweetId>.md` 时自动 skip
- 单条失败不中断整体
- 自动生成中文摘要并写入 frontmatter `summary` 字段和正文引用块

## Step 2C: Debug 认证模式

首次接入、401/403、cookie 失效或结构变化排查时执行：

```bash
npx -y bun skills/x-toolkit/scripts/main.ts --mode debug --count 5 --save-raw
```

说明：
- 输出 `tweetIds` 和 `nextCursor`
- `--save-raw` 会保存原始 JSON，便于排查结构变化
- 返回 401/403 通常表示 cookie 已失效，需要刷新认证信息

## 断点续传

书签模式会在 output 目录维护 `exported-ids.json`：

- `--all` 模式下，中断后重跑会自动跳过已导出内容，并从上次 cursor 继续
- 遇到 429 限流会按响应头等待后重试
- 若要完全重新导出，删除 `exported-ids.json`

## Output

```text
<output>/SUMMARY.md                         # only when --with-summary
<output>/<YYYYMMDD-HHmmss-标题-作者-id>/<tweetId>.md
<output>/<YYYYMMDD-HHmmss-标题-作者-id>/imgs/*
<output>/<YYYYMMDD-HHmmss-标题-作者-id>/videos/*
```
