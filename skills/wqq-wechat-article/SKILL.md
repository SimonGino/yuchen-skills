---
name: wqq-wechat-article
description: Creates Chinese tutorial-style WeChat articles from pasted URL sources and a user-written one-sentence summary/outline. Outputs Markdown and a list of infographic prompts. Use when user mentions "公众号文章", "教程", "写文章大纲", or wants to turn links/notes/素材 into a tutorial article for WeChat (微信公众号). Also triggers when user asks to organize markdown/txt notes into an article with infographic prompts, or wants to draft an article outline (大纲) for a WeChat audience, even if they don't explicitly say "公众号".
---

# WeChat Tutorial Article Workflow (MVP)

目标：把你贴的链接内容（素材）+ 你的一句话总结/大纲，整理成**中文教程类公众号文章 Markdown**，并给出 1 张公众号封面图（双裁切规范）+ 2-4 张信息图的生成提示词（可选调用 `/wqq-image-gen` 生成图片）。

## Phase 0: 风格学习（必须先执行）

在生成任何内容前，**必须**先完成以下准备：

### 1. 读取风格指南和合规规则

使用 Read 工具读取以下两个文件（路径相对于本 SKILL.md）：

1. **`references/style-guide.md`** — 写作风格总结（标题、段落、句式、禁忌等）
2. **`references/compliance.md`** — 平台合规规则（敏感词、去品牌测试等）

**生成的所有内容必须严格遵循这两个文件的要求。**

### 2. （可选）读取 1-2 篇相关历史文章

按以下优先级获取 `WQQ_PAST_ARTICLES_DIR`（先文件，后环境变量）：

1. **优先**：读 `~/.wqq-skills/.env` 文件，解析其中的 `WQQ_PAST_ARTICLES_DIR` 值
   ```bash
   grep '^WQQ_PAST_ARTICLES_DIR=' ~/.wqq-skills/.env | cut -d= -f2-
   ```
2. **回退**：检查 shell 环境变量 `$WQQ_PAST_ARTICLES_DIR`

执行规则（必须严格遵循）：
1. 若两处都未配置：**直接跳过历史文章步骤**，不要猜测或搜索其他仓库/目录。
2. 若已配置且目录存在：按以下选择流程挑选 1-2 篇文章作为范例。
3. 若已配置但目录不存在：提示路径无效并跳过，不要回退到任何默认目录。

选择流程（必须严格遵循）：

1. 检查目录下是否存在 `engagement.yaml`。
2. 若存在：读取该文件，按 `score` 降序取前 10 篇文章作为**候选池**。
3. 从候选池中按"主题相近 + 结构相似"选 1-2 篇。
4. 若 `engagement.yaml` 不存在：回退到全量文章，按"主题相近 + 结构相似"选择。

选择时优先：
- 主题相近的（如都是工具教程、都是配置指南）
- 结构相似的（如都是长文、都是快速指南）
- 高 engagement 的文章代表被验证过的写作模式，应优先参考

读取后，提取该文章的：
- 章节结构
- 开头和结尾模式
- 表格和列表的使用方式
- 代码块的组织方式

---

## Usage

### Workspace-first defaults

- 默认 workspace = 当前工作目录（`cwd`）
- 可通过 `--workspace <path>` 覆盖
- `--workspace` 与 `--sources` 不能同时使用
- 扫描规则：递归查找 `*.md` / `*.txt`
- 默认排除目录：`.git`、`node_modules`、`wechat-article`

如果 front matter 缺失，系统会自动补齐最小字段：
- `title`（回退优先级：YAML title > 首个 H1 > 文件名）
- `source_path`
- `ingested_at`
- `tags`

输入（MVP）：
- 你手动收集的 sources（Markdown 文件，建议包含：来源、标题、摘录、你的理解）
- 你自己写的：一句话总结 + 可选要点大纲（偏教程：是什么/怎么用/注意事项）
- 可选：引导动作关键词（用于“回复关键词领取资料”）

输出：
- 公众号友好的 Markdown 正文
- 公众号封面图 prompt（同一张图兼容 1:1 与 2.35:1 裁切）
- 信息图清单 + 每张图的生成 prompt

建议调用链：
1. 你把素材整理为 `sources/*.md`
2. `/wqq-wechat-article`（本技能）→ 整理大纲 + 成稿 + 信息图 prompts
3. （可选）`/wqq-image-gen` → 按 prompts 生成图片

## Output

Create an output directory per article:

```
wechat-article/<topic-slug>/
  00-summary.md
  sources/
    01-source-<slug>.md
    02-source-<slug>.md
  01-sources.md
  02-outline.md
  03-article.md
  04-infographics/
    00-cover-prompt.md
    00-cover-<slug>.png
    prompts.md
    01-infographic-<slug>.png
    02-infographic-<slug>.png
```

### Output Directory Naming

- Base: `wechat-article/<topic-slug>/`
- If exists: `wechat-article/<topic-slug>-YYYYMMDD-HHMMSS/`

`<topic-slug>` rules:
- 2-4 个词，kebab-case
- 来自你的一句话总结里的主题关键词

## Workflow Steps

### Step 1: Create Output Directory

1. 解析 workspace（默认 `cwd`，或 `--workspace`）。
2. 递归扫描 workspace 中的 `*.md/*.txt`，排除 `.git`、`node_modules`、`wechat-article`。
3. 自动生成一句话总结并提取主题 → `<topic-slug>`。
4. 在 `<workspace>/wechat-article/` 下创建输出目录（冲突就加时间戳）。

### Step 2: Ingest Sources (URLs → Markdown)

将扫描到的素材标准化后写入：

`<outdir>/sources/NN-source-<slug>.md`

然后生成 `01-sources.md`（合并视图）：
- 合并所有 sources（保留每条来源的 YAML metadata）
- 最后列一个“来源链接清单”（原始 URL）

### Step 3: Produce Tutorial Outline

如果用户没有给出大纲：
- 先问 3 个最小问题：
  1) 目标读者是谁（小白/进阶/有经验）
  2) 读完要能做什么（可操作结果）
  3) 文章要覆盖哪些步骤（3-8 条即可）

输出 `02-outline.md`：
- 严格按教程结构
- 参考模板见 references

### Step 4: Draft WeChat Markdown Article

输出 `03-article.md`。写作前**必须先读取以下两个 reference 文件**：

1. **`references/style-guide.md`**（写作风格）— 结构、格式、语言风格、禁忌，全部按此执行
2. **`references/compliance.md`**（平台合规）— 敏感词、去品牌测试、标题审核规则

两个文件的要求同等重要，缺一不可。

#### 图片文件名规范化（必须执行）

源文件中的图片如果用了无意义的文件名（如 `img-20250301.png`、`pixpin-screenshot-001.png`、`截图2025.png`、`image.png` 等），在输出时**必须重命名**为有语义的名称。

规则：
- 根据图片的上下文（前后段落内容、所在章节标题）推断图片含义
- 命名格式：`<章节序号>-<描述>.png`，kebab-case，2-4 个英文词
  - 例：`03-config-overview.png`、`05-error-log-example.png`
- 如果图片有 alt text，优先参考 alt text
- 仅重命名无意义文件名，已有语义名称的保持不变
- 在输出的 `03-article.md` 中使用新文件名引用

#### 开头/结尾增长钩子（必须执行）

品牌名：**宇辰AI编程**

每篇文章必须在**开头**和**结尾**各放 1 个引导动作钩子（共 2 处），并按以下分支执行：

1) **用户未提供关键词（默认）**
- 目标：关注引导 + 交流群引导。
- 开头话术（示例）：
  - “这篇会直接带你拿到结果。我是宇辰，类似这种可落地的实战内容，我会在「宇辰AI编程」持续更新，建议先关注。”
- 结尾话术（示例）：
  - “我是宇辰，如果这篇对你有帮助，关注「宇辰AI编程」，我会继续更新同主题的实战教程。加我的 AI 编程交流群一起聊：后台回复「交流群」即可加入。”

2) **用户提供了关键词**
- 目标：用”回复关键词领取资料”做转化，并保留关注 + 交流群引导。
- 开头话术（示例）：
  - “文末给你留了资料领取方式：在「宇辰AI编程」后台回复【<关键词>】可拿完整清单。先往下看正文步骤。”
- 结尾话术（示例）：
  - “一句话总结：按文中步骤执行即可落地。想直接拿我整理好的完整版资料，后台回复【<关键词>】。我是宇辰，关注「宇辰AI编程」持续获取实战内容，回复「交流群」加入 AI 编程交流群一起进步。”

执行细则：
- 不要杜撰关键词；只有用户明确给出关键词时，才使用关键词分支。
- 同一篇文章只使用一个关键词，保持前后一致。
- 禁止”必须关注才给资料”这类强制表达，保持自然、实用、不过度营销。
- 品牌名「宇辰AI编程」在结尾必须出现至少一次，开头可自然带入。
- 交流群引导放在结尾，不要在开头提。

### Step 5: WeChat 封面图（双裁切规范，必须执行）

公众号封面只生成 **1 张源图**，但必须同时兼容两种微信裁切：
- `1:1`（转发卡片、公众号主页）
- `2.35:1`（订阅号消息列表）

输出 `04-infographics/00-cover-prompt.md`，并且必须包含以下硬性规则：

1. **画布比例**：`2.35:1`（推荐 `2350x1000` 或同等比例更高分辨率）
2. **1:1 安全区**：居中正方形；宽度占整图 `42.55%`，左右安全边距各 `28.72%`
3. **内容布局**：
   - 标题、核心主体、品牌标识必须全部落在 1:1 安全区内
   - 左右两翼仅放背景延展或装饰，不放关键信息
   - 禁止关键文字贴边或压角
4. **可读性**：
   - 封面主标题建议 `<= 12` 个汉字
   - 避免小字号密集文案，优先单焦点 + 高对比
5. **生成命令**：
   - 优先：`/wqq-image-gen --prompt "..." --image 04-infographics/00-cover-<slug>.png --ar 2.35:1`
   - 若模型不接受 `2.35:1`：使用 `--ar 21:9` 近似，并保留同样的安全区约束

### Step 6: Infographic Opportunities + Prompts

从文章中挑 2-4 个最值得配图的位置（优先）：
1. 整体流程/架构（流程图/结构图）
2. Step 汇总（清单卡片）
3. 关键对比（Do/Don't、Before/After）
4. 常见坑与排错（决策树/排错流程）

输出 `04-infographics/prompts.md`：
- 每张图：目的、放置位置、关键文案要点、建议比例（默认 `1:1`；长流程可 `9:16`）
- 每张图给出可直接用于 `/wqq-image-gen` 的英文 prompt（图中文字可要求中文）

参考模板见：[references/infographic-prompt-template.md](references/infographic-prompt-template.md)

## References

- **Style guide (MUST READ)**: [references/style-guide.md](references/style-guide.md) — 写作结构、格式、语言风格、禁忌
- **Compliance (MUST READ)**: [references/compliance.md](references/compliance.md) — 平台合规、敏感词、去品牌测试
- **Past articles (optional)**: `WQQ_PAST_ARTICLES_DIR`（未配置则跳过）
- **Engagement data (optional)**: `WQQ_PAST_ARTICLES_DIR/engagement.yaml`（按 score 降序取前 10 作为候选池）
- Tutorial template: [references/tutorial-template.md](references/tutorial-template.md)
- Infographic prompt template: [references/infographic-prompt-template.md](references/infographic-prompt-template.md)
