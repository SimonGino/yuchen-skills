# yuchen-skills

个人 [Claude Code](https://claude.ai/code) 技能集合，涵盖 X/Twitter、WeChat 公众号、YouTube 频道监控等场景的自动化工作流。

每个 skill 作为 Claude Code 的自定义技能运行——通过自然语言触发，Claude 自动调用对应脚本完成任务。

## 安装

### 通过 Plugin Marketplace（推荐）

在 Claude Code 中运行：

```
/plugin marketplace add SimonGino/yuchen-skills
```

然后安装需要的 plugin：

```
/plugin install social-media-tools@yuchen-skills
/plugin install yt-monitor@yuchen-skills
```

也可以通过 Browse UI 安装：

1. 在 Claude Code 中运行 `/plugin`
2. 选择 **Browse and install plugins**
3. 选择 **yuchen-skills**
4. 选择要安装的 plugin → **Install now**

### 手动安装

```bash
git clone https://github.com/SimonGino/yuchen-skills.git
cd yuchen-skills
npm install                                              # TypeScript skills
uv sync --project skills/yt-monitor --extra transcribe   # yt-monitor (可选)
```

## Available Plugins

| Plugin | 说明 | 包含 Skills |
|---|---|---|
| **social-media-tools** | X/Twitter 内容导出与 WeChat 公众号文章生成 | [x-toolkit](#x-toolkit), [wqq-wechat-article](#wqq-wechat-article) |
| **yt-monitor** | YouTube 频道监控、字幕下载与 AI 总结 | [yt-monitor](#yt-monitor) |

## Skills 详细说明

### x-toolkit

导出 X 书签或将 X 链接转为本地 Markdown，支持分页、媒体下载、AI 汇总与认证 debug。

**运行时**：Bun (TypeScript)

**触发示例**：
- "导出我的 X 书签"
- "把这条推文转成 Markdown：https://x.com/..."

**直接运行**：
```bash
# 书签导出
npx -y bun skills/x-toolkit/scripts/main.ts --mode bookmarks --limit 10

# 链接转 Markdown
npx -y bun skills/x-toolkit/scripts/main.ts --urls https://x.com/user/status/123456
```

### wqq-wechat-article

从素材生成中文教程类公众号文章 + 信息图 prompt。

**运行时**：Bun (TypeScript)

**触发示例**：
- "帮我写一篇公众号文章"
- "把这些素材整理成教程"

**直接运行**：
```bash
npx -y bun skills/wqq-wechat-article/scripts/main.ts --workspace ./my-sources
```

### yt-monitor

YouTube 频道监控 → 字幕下载 → AI 总结。

**运行时**：Python (uv)

**触发示例**：
- "检查 YouTube 频道更新，总结新视频"
- "下载这个视频的字幕"

**直接运行**：
```bash
uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py check --days 7
uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_subtitle_dl.py download "URL"
```

## 前置条件

- [Claude Code](https://claude.ai/code)（作为技能宿主）
- [Bun](https://bun.sh/)（TypeScript skills: x-toolkit, wqq-wechat-article）
- [uv](https://docs.astral.sh/uv/)（yt-monitor）
- Chrome 浏览器（X cookie 认证、YouTube cookie 认证）

> **注意**：yt-monitor 的 mlx-whisper 转录功能仅支持 Apple Silicon (macOS)。

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

## 更新

通过 Claude Code 更新到最新版本：

1. 运行 `/plugin`
2. 切换到 **Marketplaces** 标签
3. 选择 **yuchen-skills** → **Update marketplace**

也可以开启 **Enable auto-update** 自动获取最新版本。

## 开发

```bash
# 类型检查
bun run typecheck

# 运行所有测试
bun run test

# 运行单个测试文件
bun test skills/x-toolkit/scripts/common/markdown.test.ts
```

### 项目结构

```
skills/
  x-toolkit/             # X 书签导出 / X 链接转 Markdown
    scripts/common/      # 共享模块
    scripts/bookmarks/   # 书签专属模块
    scripts/export/      # URL 导出专属模块
  wqq-wechat-article/    # 公众号文章生成
    references/          # 写作风格、合规规则、模板
  yt-monitor/            # YouTube 频道监控 (Python)
.claude-plugin/          # Plugin Marketplace 配置
```

## License

This repository is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0).
See [LICENSE](./LICENSE) for the full text.

AGPL-3.0 要求通过网络提供服务时也需开放源代码。详见 [AGPL-3.0 说明](https://www.gnu.org/licenses/agpl-3.0.html)。
