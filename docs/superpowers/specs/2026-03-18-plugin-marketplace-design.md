# Plugin Marketplace 支持设计

## 背景

yuchen-skills 仓库包含 3 个 Claude Code skill（x-toolkit、wqq-wechat-article、yt-monitor），目前只能通过 clone 仓库使用。需要支持 Claude Code 的 Plugin Marketplace 机制，让其他用户可以通过 `/plugin marketplace add` 直接安装。

参考项目：[baoyu-skills](https://github.com/JimLiu/baoyu-skills)

## 设计决策

### Plugin 分组：按主题分两组

| Plugin | 说明 | 包含 Skills | 运行时 |
|---|---|---|---|
| **social-media-tools** | X/Twitter 内容导出与 WeChat 公众号文章生成 | x-toolkit, wqq-wechat-article | Bun (TypeScript) |
| **yt-monitor** | YouTube 频道监控、字幕下载与 AI 总结 | yt-monitor | Python (uv) |

分组理由：
- x-toolkit 和 wqq-wechat-article 都是社交媒体内容工具，共享 Bun 运行时
- yt-monitor 使用 Python/uv，独立运行时和依赖链

### 目录结构：不改动

现有 `skills/` 目录结构完全保持不变。marketplace.json 通过 `"source": "./"` + `"skills"` 字段直接引用 skill 路径，无需在每个 skill 目录下放 `.claude-plugin/plugin.json`。

### 版本策略

marketplace 版本从 `0.1.0` 升至 `1.0.0`，标志首次正式公开发布。后续 skill 更新随 marketplace 版本递增。

### `strict: true` 说明

`strict: true` 表示如果 plugin 目录下存在 `plugin.json`，以其为权威来源。我们不创建 `plugin.json`，所以 marketplace.json 中的定义就是完整定义。这不影响 skill 运行时对 `references/`、`~/.wqq-skills/.env` 等外部文件的访问。

## 改动范围

### 1. `.claude-plugin/marketplace.json`（重写）

```json
{
  "name": "yuchen-skills",
  "owner": {
    "name": "wqq",
    "email": ""
  },
  "metadata": {
    "description": "个人 Claude Code 技能集合：X/Twitter、WeChat 公众号、YouTube 频道监控",
    "version": "1.0.0"
  },
  "plugins": [
    {
      "name": "social-media-tools",
      "description": "X/Twitter 内容导出与 WeChat 公众号文章生成",
      "source": "./",
      "strict": true,
      "skills": [
        "./skills/x-toolkit",
        "./skills/wqq-wechat-article"
      ]
    },
    {
      "name": "yt-monitor",
      "description": "YouTube 频道监控、字幕下载与 AI 总结",
      "source": "./",
      "strict": true,
      "skills": [
        "./skills/yt-monitor"
      ]
    }
  ]
}
```

### 2. `README.md`（重写）

新结构：

1. **项目简介** — 一句话说明 + marketplace badge
2. **安装** — marketplace 方式优先，手动克隆为备选
3. **Available Plugins** — 表格展示两个 plugin 及其包含的 skills
4. **Skills 详细说明** — 每个 skill 的功能、触发方式
5. **前置条件 & 密钥配置** — 运行时依赖和 API key 配置
6. **开发** — 给贡献者：测试、类型检查等命令
7. **License**

安装部分关键内容：

```markdown
## 安装

### 通过 Plugin Marketplace（推荐）

在 Claude Code 中运行：

​```
/plugin marketplace add SimonGino/yuchen-skills
​```

然后安装需要的 plugin：

​```
/plugin install social-media-tools@yuchen-skills
/plugin install yt-monitor@yuchen-skills
​```

### 手动安装

​```bash
git clone https://github.com/SimonGino/yuchen-skills.git
cd yuchen-skills
npm install                                        # TypeScript skills
uv sync --project skills/yt-monitor --extra transcribe  # yt-monitor (可选)
​```
```

README 还需包含：
- **更新说明**：通过 `/plugin` → Marketplaces → Update 更新
- **平台要求**：yt-monitor 的 mlx-whisper 仅支持 Apple Silicon；X 认证需要 Chrome
- **License 提示**：AGPL-3.0 的 copyleft 要求

### 3. 不改动的部分

- `skills/` 目录结构和所有源码
- 各 skill 的 `SKILL.md`
- `.claude/` 目录（项目开发用）
- `openspec/` 目录（不纳入 marketplace）
- `CLAUDE.md`
- `package.json`、`tsconfig.json`

### 4. 可选：GitHub 仓库配置

- 添加 topics：`claude-skills`、`agent-skills`（提高可发现性）
- 确保仓库是 public
