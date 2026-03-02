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

```
skills/
  shared/              # 公共工具
    retry.ts           # 指数退避重试
    arg-parser.ts      # CLI 参数解析
    wqq-skills-env.ts  # 环境变量/密钥加载
    x-runtime/         # X/Twitter API 客户端、认证、媒体下载
  x-bookmarks/         # 导出 X 书签为 Markdown
    scripts/main.ts    # CLI 入口
    SKILL.md           # 技能文档
  x-to-md/             # 将 X 链接转为 Markdown
    scripts/main.ts    # CLI 入口
    SKILL.md           # 技能文档
```
