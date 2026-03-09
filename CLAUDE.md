# CLAUDE.md

这个仓库包含用于 X/Twitter 媒体平台研究的个人 Claude Code 技能。

## 原则

- 工作流定义在 `SKILL.md` + `references/` 中。
- 确定性操作在 `scripts/*.ts` 中，通过 Bun 执行。
- MVP 阶段不引入外部 npm 依赖（仅使用 Bun 运行时）。

## 运行脚本

```bash
npx -y bun skills/<skill>/scripts/main.ts --help
```

### 直接执行

```bash
# 导出 X 书签
npx -y bun skills/x-bookmarks/scripts/main.ts --limit 50

# 将 X 链接转为 Markdown
npx -y bun skills/x-to-md/scripts/main.ts \
  --urls https://x.com/<user>/status/<id>
```

### Python skill (yt-monitor)

```bash
# 初始化环境（首次）
uv sync --project skills/yt-monitor --extra transcribe

# 运行 yt-monitor 脚本
uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py list
uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_subtitle_dl.py download "URL"
```

## 密钥管理

- API 密钥放在 `$HOME/.wqq-skills/.env`。
- 不要提交密钥；`.wqq-skills/` 已被 gitignore。
- 仅从文件读取的密钥：`OPENAI_API_KEY`、`OPENAI_BASE_URL`。
- X 认证：`X_AUTH_TOKEN`、`X_CT0`（或通过 `python3` + `browser_cookie3` 自动从 Chrome 读取 cookies）。

## 开发

### 类型检查

```bash
bun run typecheck
```

### 测试

```bash
bun run test
```

### 项目结构

每个 skill 完全自包含，所有源码（含 x-runtime 模块）在 `scripts/` 目录内。

```
skills/
  x-bookmarks/         # 导出 X 书签为 Markdown（自包含）
    scripts/            # 所有源码 + x-runtime 模块
    SKILL.md            # 技能文档
  x-to-md/             # 将 X 链接转为 Markdown（自包含）
    scripts/            # 所有源码 + x-runtime 模块
    SKILL.md            # 技能文档
```
