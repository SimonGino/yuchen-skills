# wqq-x-bookmarks

导出 X（Twitter）书签为 Markdown，支持调试认证、分页抓取、媒体本地化和重复导出 skip。

## 前置条件

- 需要可用的 X cookies：`auth_token`、`ct0`
- 优先使用环境变量注入（最稳定）：

```bash
export X_AUTH_TOKEN="..."
export X_CT0="..."
```

- 若未传环境变量，脚本会尝试自动读取本机 Chrome 的 X cookie（需要 `python3` 和 `browser_cookie3`）。

## 调试认证与分页

```bash
npx -y bun skills/wqq-x-bookmarks/scripts/debug.ts --count 5 --save-raw
```

能力：
- 验证认证是否可用
- 拉取一页书签并输出 `tweetIds` / `nextCursor`
- 可选保存原始响应 JSON

## 导出书签

默认导出最新 50 条，默认下载媒体：

```bash
npx -y bun skills/wqq-x-bookmarks/scripts/main.ts
```

常用参数：

```bash
npx -y bun skills/wqq-x-bookmarks/scripts/main.ts --limit 10
npx -y bun skills/wqq-x-bookmarks/scripts/main.ts --output /tmp/wqq-x-bookmarks-demo
npx -y bun skills/wqq-x-bookmarks/scripts/main.ts --no-download-media
npx -y bun skills/wqq-x-bookmarks/scripts/main.ts --limit 10 --with-summary
```

## AI 汇总（`--with-summary`）

启用后会生成 `SUMMARY.md`，每条包含三段式：
- 一句话摘要
- 相关性说明
- 来源链接

配置（`~/.wqq-skills/.env`）：

```bash
mkdir -p ~/.wqq-skills
cat >> ~/.wqq-skills/.env << 'EOF'
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://api.openai.com/v1
EOF
```

可选：`OPENAI_MODEL`（默认 `gpt-4o-mini`，可用环境变量覆盖）。

行为说明：
- 缺少 `OPENAI_API_KEY`：直接报错
- OpenAI 调用失败或返回格式异常：自动回退规则摘要，不中断导出

## 输出结构

```text
<output>/SUMMARY.md                         # only when --with-summary
<output>/<标题-作者-id>/<tweetId>.md
<output>/<标题-作者-id>/imgs/*
<output>/<标题-作者-id>/videos/*
```

重复导出同一目录时，若已存在 `<tweetId>.md`，会自动 `skipped`。
