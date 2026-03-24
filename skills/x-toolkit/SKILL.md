---
name: wqq-x-toolkit
description: 导出 X 书签或将指定 X/Twitter status URLs 导出为 Markdown，支持 debug 认证验证、媒体下载、自动富化摘要/标签、按索引查询已保存推文。Use when user mentions "X书签", "推特书签", "tweet to markdown", "导出推文", "bookmarks", or wants to save/export tweets, bookmarks, convert X/Twitter URLs to local markdown files, or search previously saved tweets.
---

# WQQ X Toolkit Workflow

统一处理三类任务：
- **导出**：书签分页抓取或 URL 推文导出为本地 Markdown
- **富化**：为导出的推文生成中文摘要和分类标签
- **查询**：在已保存的推文中搜索特定内容

## Prerequisites

- 书签模式需要 X 登录态：
  - 推荐环境变量：`X_AUTH_TOKEN`、`X_CT0`
  - 若未提供，脚本会尝试读取本机 Chrome cookie（依赖 `python3` + `browser_cookie3`）
- 推文导出模式无需 X 登录态（使用 fxtwitter 公共 API）

## 工作流 1: 导出

解析用户的自然语言意图，翻译为脚本参数后执行。

### 意图识别

- 用户提供 `x.com/.../status/...` 或 `twitter.com/.../status/...` URL → 推文导出模式
- 用户提到「导出书签」「X bookmarks」等 → 书签导出模式
- 用户提到认证异常、cookie、debug → Debug 认证模式
- 意图不明确 → 用 AskUserQuestion 询问

### 参数翻译示例

| 用户意图 | 脚本参数 |
|---------|---------|
| "帮我导出一个月内的书签" | `--mode bookmarks --since YYYY-MM-DD`（模型推算日期） |
| "导出最近 20 条书签" | `--mode bookmarks --limit 20` |
| "导出所有书签" | `--mode bookmarks --all` |
| "把这条推文保存下来 URL" | `--urls URL` |

### 书签导出

在执行前，如果用户原始指令未明确以下参数，用 AskUserQuestion 确认：
1. 导出范围：全部（`--all`）、指定数量（`--limit`）、或按时间（`--since`）
2. 是否下载媒体文件（默认下载，`--no-download-media` 跳过）

```bash
npx -y bun skills/x-toolkit/scripts/main.ts --mode bookmarks [参数]
```

常用示例：

```bash
# 默认 50 条
npx -y bun skills/x-toolkit/scripts/main.ts --mode bookmarks

# 指定数量
npx -y bun skills/x-toolkit/scripts/main.ts --mode bookmarks --limit 10

# 按时间过滤
npx -y bun skills/x-toolkit/scripts/main.ts --mode bookmarks --since 2026-02-24

# 全部书签
npx -y bun skills/x-toolkit/scripts/main.ts --mode bookmarks --all

# 不下载媒体
npx -y bun skills/x-toolkit/scripts/main.ts --mode bookmarks --all --no-download-media
```

### 推文导出

```bash
npx -y bun skills/x-toolkit/scripts/main.ts --urls <url1> <url2> ...
```

行为：
- 支持 `x.com` / `twitter.com` status URL
- 已存在 `<tweetId>.md` 时自动 skip
- 单条失败不中断整体

### Debug 认证模式

```bash
npx -y bun skills/x-toolkit/scripts/main.ts --mode debug --count 5 --save-raw
```

### 断点续传

书签模式在 output 目录维护 `exported-ids.json`：
- `--all` 模式下中断后重跑会自动跳过已导出内容
- 遇到 429 限流会按响应头等待后重试
- 若要完全重新导出，删除 `exported-ids.json`

### 限流处理

若脚本因 API 限流中断退出（非零退出码且日志包含 429/rate limit），告知用户：
> "已导出 X 条推文，因 API 限流暂停。稍后可重新运行继续导出。"

## 工作流 2: 富化

导出完成后**自动衔接**，无需用户额外指令。

### 步骤

1. 读取输出目录下的 `manifest.json`，获取本次新增文件列表
2. 读取 `skills/x-toolkit/references/categories.yaml`，加载分类体系
3. 分批处理（每批 10-15 条）：
   - 读取该批所有 markdown 文件内容
   - 为每条生成：中文摘要（1-2 句话）+ 从分类体系中选择标签
   - 写回各文件 frontmatter，添加以下字段：
     ```yaml
     summary: "摘要内容"
     tags: ["标签1", "标签2"]
     source: "bookmarks"   # 或 "urls"
     enrichedAt: "ISO时间戳"
     ```
   - 将该批条目追加到 `index.json`
4. 全部完成后向用户报告汇总：
   > "已导出 N 条推文，涵盖 AI工具(12)、前端(5)、开发效率(8) 等分类"

### index.json 格式

```json
{
  "version": 1,
  "updatedAt": "ISO时间戳",
  "entries": [
    {
      "tweetId": "123456",
      "path": "相对路径/123456.md",
      "author": "username",
      "summary": "中文摘要",
      "tags": ["标签"],
      "tweetDate": "ISO时间戳",
      "source": "bookmarks"
    }
  ]
}
```

### 分类体系

从 `references/categories.yaml` 读取。可以建议新增分类，但需用户确认后才添加到文件中。

### 边界情况

- `manifest.json` 不存在：跳过富化，告知用户
- `index.json` 不存在：创建新的空索引
- `index.json` 损坏：扫描输出目录所有 markdown 的 frontmatter 重建
- 现有分类不够覆盖：建议新分类，等用户确认

## 工作流 3: 查询

在已保存的推文中搜索。完全由模型完成，无需脚本。

### 步骤

1. 读取输出目录下的 `index.json`
2. 按 tags 过滤 + 按 summary 文本匹配用户查询意图
3. 如果索引匹配不够，用 Grep 工具搜索 markdown 文件正文补充
4. 呈现列表：

   > 找到 5 条关于 Claude Code 的推文：
   >
   > 1. **标题** - @author (日期)
   >    摘要内容
   >    标签: AI工具, 开发效率
   >
   > 2. ...

5. 用户说"打开第 N 条"时，读取完整 markdown 展示全文

### 查询示例

- "帮我找之前保存的关于 Claude Code 的推文"
- "有没有关于前端的推文"
- "最近保存的 AI 相关内容"

## Output

```text
<output>/manifest.json                            # 最近一次导出的新文件清单
<output>/index.json                               # 全局索引（富化后更新）
<output>/exported-ids.json                         # 断点续传状态（bookmarks only）
<output>/<YYYYMMDD-HHmmss-标题-作者-id>/<tweetId>.md
<output>/<YYYYMMDD-HHmmss-标题-作者-id>/imgs/*
<output>/<YYYYMMDD-HHmmss-标题-作者-id>/videos/*
```

输出基础路径：`~/.wqq-skills/.env` 中的 `X_OUTPUT_DIR`，未配置时为当前工作目录。子目录名固定为 `x-toolkit-output`。
