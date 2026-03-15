# yuchen-skills

个人 [Claude Code](https://claude.ai/code) 技能集合，涵盖 X/Twitter、WeChat 公众号、YouTube 频道监控等场景的自动化工作流。

每个 skill 作为 Claude Code 的自定义技能运行——通过自然语言触发，Claude 自动调用对应脚本完成任务。

## Skills 一览

| Skill | 说明 | 运行时 |
|---|---|---|
| **x-toolkit** | 导出 X 书签或将 X 链接转为本地 Markdown，支持分页、媒体下载、AI 汇总与认证 debug | Bun (TypeScript) |
| **wqq-wechat-article** | 从素材生成中文教程类公众号文章 + 信息图 prompt | Bun (TypeScript) |
| **yt-monitor** | YouTube 频道监控 → 字幕下载 → AI 总结 | Python (uv) |

## 快速开始

### 前置条件

- [Bun](https://bun.sh/) (TypeScript skills)
- [uv](https://docs.astral.sh/uv/) (yt-monitor)
- [Claude Code](https://claude.ai/code) (作为技能宿主)

### 安装

```bash
git clone https://github.com/<your-username>/yuchen-skills.git
cd yuchen-skills
npm install       # 安装 bun-types 等 devDependencies
```

### 密钥配置

API 密钥统一存放在 `~/.wqq-skills/.env`：

```bash
mkdir -p ~/.wqq-skills
cat > ~/.wqq-skills/.env << 'EOF'
# X/Twitter 认证（或通过 Chrome cookie 自动读取）
X_AUTH_TOKEN=...
X_CT0=...

# OpenAI（用于 AI 摘要/汇总）
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://api.openai.com/v1
EOF
```

## 使用方式

### 在 Claude Code 中使用（推荐）

安装 Claude Code 后，在本仓库目录下启动 Claude，直接用自然语言触发：

- "导出我的 X 书签" → 触发 x-toolkit
- "把这条推文转成 Markdown：https://x.com/..." → 触发 x-toolkit
- "检查 YouTube 频道更新，总结新视频" → 触发 yt-monitor
- "帮我写一篇公众号文章" → 触发 wqq-wechat-article

### 直接运行脚本

```bash
# X 书签导出（默认 50 条）
npx -y bun skills/x-toolkit/scripts/main.ts --mode bookmarks --limit 10

# X 链接转 Markdown
npx -y bun skills/x-toolkit/scripts/main.ts \
  --urls https://x.com/user/status/123456

# WeChat 文章生成
npx -y bun skills/wqq-wechat-article/scripts/main.ts --workspace ./my-sources

# YouTube 频道监控
uv sync --project skills/yt-monitor --extra transcribe  # 首次初始化
uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py check --days 7
uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_subtitle_dl.py download "URL"
```

## 开发

```bash
# 类型检查
bun run typecheck

# 运行所有测试
bun run test

# 运行单个测试文件
bun test skills/x-toolkit/scripts/common/markdown.test.ts
```

## 项目结构

```
skills/
  x-toolkit/             # X 书签导出 / X 链接转 Markdown
    scripts/common/      # 共享模块
    scripts/bookmarks/   # 书签专属模块
    scripts/export/      # URL 导出专属模块
  wqq-wechat-article/    # 公众号文章生成
    references/           # 写作风格、合规规则、模板
  yt-monitor/             # YouTube 频道监控 (Python)
openspec/                 # Spec-driven 变更管理
.claude/                  # Claude Code 技能定义与命令
```

每个 skill 完全自包含——所有源码、测试、类型定义均在 `skills/<name>/scripts/` 目录内，不依赖外部 npm 包（MVP 原则）。

## License

This repository is licensed under the GNU Affero General Public License v3.0.
See [LICENSE](./LICENSE) for the full text.
