# x-toolkit 统一输出、模型原生富化与查询能力

## 概述

对 x-toolkit 进行三项架构改进：
1. 合并两个输出目录为统一的 `x-toolkit-output`
2. 摘要和标签由运行环境模型直接生成，移除 OpenAI API 依赖
3. 新增基于索引的查询能力，支持自然语言搜索已保存推文

## 设计原则

**脚本做确定性工作，模型做理解性工作。**

- 脚本层：数据抓取、格式转换、媒体下载、状态管理
- 模型层：意图解析、摘要生成、标签分类、内容查询

## 统一输出目录

### 变更

将 `wqq-x-bookmarks-output` 和 `wqq-x-to-md-output` 合并为 `x-toolkit-output`。

输出基础路径逻辑不变：优先读 `~/.wqq-skills/.env` 中的 `X_OUTPUT_DIR`，未配置时 fallback 到 `process.cwd()`。

### 目录结构

```
$X_OUTPUT_DIR/x-toolkit-output/
├── index.json                              # 全局索引（模型维护）
├── exported-ids.json                       # 断点续传状态（脚本维护，bookmarks only）
├── manifest.json                           # 最近一次导出的新文件清单（临时，每次导出覆盖）
├── 20260320-091522-Some-Title-author-1234567890/
│   ├── 1234567890.md
│   ├── imgs/
│   └── videos/
└── 20260321-143022-Another-Tweet-user2-9876543210/
    ├── 9876543210.md
    └── imgs/
```

无论 bookmarks 还是 URL 导出，产出结构完全一致。来源通过 frontmatter 中的 `source` 字段区分。

## 数据格式

### manifest.json

脚本导出完毕后输出，告知模型本次新增了哪些文件：

```json
{
  "exportedAt": "2026-03-24T10:30:00.000Z",
  "source": "bookmarks",
  "newFiles": [
    { "tweetId": "123456", "path": "20260324-.../123456.md", "author": "someuser" },
    { "tweetId": "789012", "path": "20260324-.../789012.md", "author": "another" }
  ],
  "skipped": ["111111"],
  "failed": ["222222"]
}
```

### 富化后的 frontmatter

脚本输出（无摘要、无标签）：

```yaml
---
url: "https://x.com/someuser/status/123456"
author: "Some User (@someuser)"
authorUsername: "someuser"
tweetCount: 1
---
```

模型富化后：

```yaml
---
url: "https://x.com/someuser/status/123456"
author: "Some User (@someuser)"
authorUsername: "someuser"
tweetCount: 1
summary: "介绍了 Claude Code 的新 hook 机制，可以在工具调用前后自动执行脚本"
tags: ["AI工具", "开发效率"]
source: "bookmarks"
enrichedAt: "2026-03-24T10:35:00.000Z"
---
```

### index.json

全局索引，模型在富化流程中增量更新：

```json
{
  "version": 1,
  "updatedAt": "2026-03-24T10:35:00.000Z",
  "entries": [
    {
      "tweetId": "123456",
      "path": "20260324-...-someuser-123456/123456.md",
      "author": "someuser",
      "summary": "介绍了 Claude Code 的新 hook 机制...",
      "tags": ["AI工具", "开发效率"],
      "tweetDate": "2026-03-20T09:15:22.000Z",
      "source": "bookmarks"
    }
  ]
}
```

### categories.yaml

预定义分类体系，存放于 `references/categories.yaml`：

```yaml
categories:
  - AI工具
  - 前端
  - 后端
  - 开发效率
  - 开源
  - 设计
  - 职业成长
  - 产品思维
```

扁平结构，不加 keywords 映射。模型理解内容后自行判断分类。模型可建议新增分类，需用户确认后添加。

## 工作流设计

### 工作流 1：导出

模型解析用户自然语言意图，翻译为脚本参数后执行。

示例：

- "帮我导出一个月内的书签" → `--mode bookmarks --since 2026-02-24`
- "导出最近 20 条书签" → `--mode bookmarks --limit 20`
- "把这条推文保存下来 URL" → `--urls URL`

#### 脚本参数接口

| 参数 | 说明 | 状态 |
|------|------|------|
| `--mode bookmarks` | 书签导出 | 不变 |
| `--urls <url...>` | URL 导出 | 不变 |
| `--mode debug` | 调试认证 | 不变 |
| `--since YYYY-MM-DD` | 时间截止，bookmarks 模式下遇到早于此日期的推文停止分页 | **新增** |
| `--limit N` / `--all` | 数量控制 | 不变 |
| `--output <dir>` | 自定义输出路径 | 不变 |
| `--no-download-media` | 跳过媒体下载 | 不变 |
| `--with-summary` | 生成 SUMMARY.md | **删除**（被富化流程替代） |

`--since` 与 `--limit` 同时使用时取交集：先按时间过滤，再限制数量。

### 工作流 2：富化

导出完成后自动衔接，不是独立命令：

1. 模型读取 `manifest.json`，得到新文件列表
2. 模型读取 `references/categories.yaml`，加载分类体系
3. 分批处理（每批 10-15 条）：
   - 读取该批所有 markdown 文件内容
   - 为每条生成：中文摘要（1-2 句）+ 从分类中选标签
   - 写回各文件 frontmatter（添加 summary、tags、source、enrichedAt）
   - 将该批条目追加到 index.json
4. 全部完成后向用户报告汇总，例如："已导出 35 条推文，涵盖 AI工具(12)、前端(5)、开发效率(8) 等分类"

### 工作流 3：查询

完全由模型基于 index.json + grep 完成，无脚本参与：

1. 模型读取 `index.json`
2. 按 tags 过滤 + 按 summary 文本匹配用户查询意图
3. 如果索引匹配不够，grep markdown 文件正文补充
4. 呈现列表（标题、作者、日期、摘要、标签）
5. 用户可进一步说"打开第 N 条"查看全文

### 边界情况

- **index.json 不存在或损坏**：模型扫描输出目录里所有 markdown 的 frontmatter 重建
- **未富化的文件**（frontmatter 无 summary）：查询时仍可通过 grep 正文匹配，列表中摘要显示为空
- **分类体系变更**：新增分类后旧推文不自动重新打标签，除非用户主动要求"重新分类"

## 限流与风控

### 分页层面（GraphQL 请求）

- 页间延迟：每次翻页后等待 2-3s（保留现有逻辑）
- 429 响应：指数退避重试（保留现有逻辑），但增加单次导出的最大重试次数上限
- `--since` 模式安全阀：连续遇到 N 次 429 时，保存当前进度到 `exported-ids.json` 后停止退出，下次运行从断点继续

### 单推文处理层面

- 推文间 3s 延迟（保留）
- 连续失败退避：3 次失败后 60s，5 次后 120s（保留）
- 媒体下载失败不阻塞推文导出——标记为未下载，后续可补

### `--since` 特有策略

- 脚本在每页拉取后立即更新 `exported-ids.json`，中途限流中断不丢数据
- SKILL.md 指示模型：若脚本因限流中断退出，告知用户"已导出 X 条，因 API 限流暂停，稍后可继续"

### 不做的事

- 不引入 proxy/IP 轮换（绕风控而非应对风控）
- 不预估数量来预判风险（靠断点续传兜底）

## 代码变更清单

### 删除

| 文件 | 原因 |
|------|------|
| `scripts/export/summarize.ts` | 移除 OpenAI 摘要，改为模型直接生成 |
| `scripts/export/summarize.test.ts` | 对应测试 |

### 修改

| 文件 | 变更 |
|------|------|
| `scripts/common/output.ts` | 输出子目录名改为 `x-toolkit-output` |
| `scripts/bookmarks/main.ts` | 新增 `--since` 参数解析 + 按日期截止分页 + 限流中断保存进度 + 输出 manifest.json |
| `scripts/export/main.ts` | 移除 summarize 调用 + 输出 manifest.json |
| `scripts/main.ts` | 删除 `--with-summary` 相关逻辑 |
| `scripts/types.ts` | 新增 ManifestFile、IndexEntry 等类型；删除摘要相关类型 |
| `SKILL.md` | 重写：三个工作流（导出/富化/查询）、分类体系说明、限流策略 |
| `CLAUDE.md`（项目根） | 更新 x-toolkit 目录结构说明、删除旧目录名引用 |

### 新增

| 文件 | 用途 |
|------|------|
| `scripts/common/manifest.ts` | manifest.json 写入逻辑 |
| `scripts/common/manifest.test.ts` | 对应测试 |
| `references/categories.yaml` | 预定义分类体系 |

### 不变

- `scripts/bookmarks/` 核心逻辑（GraphQL 分页、状态管理、去重）
- `scripts/export/main.ts` 的 fxtwitter 抓取逻辑
- `scripts/common/` 大部分共享模块
- 调试模式（`--mode debug`）

### index.json

由模型在富化流程中通过 Read + Edit 工具直接读写，不新增脚本模块。

## 代码层面的目录分离

`bookmarks/` 和 `export/` 在代码层面继续分离（数据来源逻辑确实不同），但输出层面完全合并。两者共用 `common/` 中的输出路径构建、manifest 写入、媒体下载等模块。
