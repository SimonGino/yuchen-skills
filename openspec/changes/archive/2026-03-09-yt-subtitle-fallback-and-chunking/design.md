## Context

yt-monitor 技能当前通过 `yt_subtitle_dl.py` 下载字幕（优先手动、其次自动生成），转为纯文本后由 Claude 直接读取并总结。两个未覆盖的场景：

1. 部分视频（尤其非英语小频道）完全没有字幕，脚本报错后流程中断
2. 长视频（播客、直播录像，1-3 小时）的字幕文本可达数万字，超出 Claude 有效处理范围

现有架构：纯 Python 脚本 + yt-dlp，密钥通过 `~/.wqq-skills/.env` 管理，已有 `OPENAI_API_KEY`、`GEMINI_API_KEY`。

## Goals / Non-Goals

**Goals:**
- 无字幕视频能通过音频转录获得文本，使总结流程继续
- 转录方案分层：Gemini API（首选，用户有额度）→ 本地 mlx-whisper（兜底，免费离线）
- 超长字幕自动检测并分块，支持分段总结 + 合并
- 保持现有接口兼容：`download_subtitle()` 返回结构向后兼容
- MVP 原则：用最简方案解决问题

**Non-Goals:**
- 不做实时流媒体字幕处理
- 不做字幕翻译（当前已有中/英语言优先级）
- 不做转录结果缓存优化（MVP 阶段先跑通）

## Decisions

### D1: 音频转录首选 Gemini API，兜底本地 mlx-whisper

**选择**: 分层回退策略：
1. 首选 Gemini API — 用户有充足额度，通过 Files API 上传音频后调用 `generateContent` 转录
2. 兜底本地 mlx-whisper — 当 Gemini API 不可用（无 key、网络问题）时，用本地模型离线转录

**替代方案**:
- OpenAI Whisper API：按时长计费 $0.006/min，用户希望节省开支 → 排除
- 只用本地模型：首次需下载 ~1.5GB 模型，长视频转录较慢 → 不作首选
- Groq Whisper API：免费但有速率限制，不如 Gemini 稳定 → 排除

**理由**: Gemini API 用户已有额度，支持多模态音频理解，API 简单。mlx-whisper 在 Apple Silicon Mac 上性能优秀，作为离线兜底方案完美互补。

### D2: Gemini API 使用 Files API 上传音频

**选择**:
- 音频 ≤ 20MB：inline base64 直接传入 `generateContent`
- 音频 > 20MB：通过 Gemini Files API 上传后引用 URI

**理由**: Gemini API inline 请求限制 20MB。Files API 无此限制，适合长视频音频。无需 ffmpeg 分段，比 Whisper API 的 25MB 限制更优雅。

### D3: 音频转录集成为独立函数，嵌入现有流程

**选择**: 在 `yt_subtitle_dl.py` 中新增转录相关函数，当字幕下载失败时自动回退调用
**替代方案**: 新建独立脚本 → 增加文件数量，SKILL.md 流程更复杂
**理由**: 对外接口不变（`download_subtitle()` 返回相同结构），Claude 调用方式完全不变。在返回结果中用 `subtitle_type: "gemini"` 或 `"mlx-whisper"` 标识来源。

### D4: 音频下载格式选择 mp3

**选择**: 用 yt-dlp 下载 mp3 格式音频（`yt-dlp -x --audio-format mp3`）
**理由**: mp3 兼容性最好，Gemini API 和 mlx-whisper 都支持。比特率约 128kbps，文件体积适中。

### D5: 字幕分块基于字符数，按自然段落边界切分

**选择**: 阈值设为 15000 字符（约 8000-10000 中文字 / 3000-4000 英文词）。超出时按段落边界（双换行）切分为多块，每块不超过阈值。
**替代方案**:
- 基于 token 计数：需要 tokenizer 依赖 → 排除（MVP 不加依赖）
- 固定行数切分：可能从句子中间截断 → 排除
**理由**: 字符数简单可靠，段落边界保持语义完整。15000 字符在 Claude 上下文中留有充足余量用于 prompt 和输出。

### D6: 分块后的总结策略由 SKILL.md 指导 Claude 执行

**选择**: 脚本只负责分块和保存多个文件（`{video_id}_part1.txt`, `_part2.txt`, ...），由 Claude 按 SKILL.md 中的指引分段阅读总结、最后合并
**替代方案**: 脚本内调用 API 自动总结 → 增加复杂度，且 Claude 本身就在做总结
**理由**: 保持"脚本做确定性操作、Claude 做智能操作"的架构原则。

### D7: Gemini API 调用使用 Python urllib（不引入 SDK）

**选择**: 通过 REST API + urllib 直接调用 Gemini，不安装 `google-genai` SDK
**理由**: 项目 MVP 原则不引入外部 npm/pip 依赖。Gemini REST API 足够简单（upload file → generateContent），用 urllib + json 即可完成。

## Risks / Trade-offs

- **[Gemini API 音频大小]** → Gemini Files API 支持大文件上传，但单次请求有 token 限制。超长音频（>3 小时）可能需要分段上传。→ 先按 MVP 跑通，遇到问题再加分段逻辑。
- **[mlx-whisper 首次使用]** → 需要下载 ~1.5GB 模型文件（large-v3-turbo），首次使用会较慢。→ 在输出中提示用户正在下载模型。
- **[mlx-whisper 安装]** → 需要 `pip install mlx-whisper`，仅支持 Apple Silicon Mac。→ 作为可选兜底，缺失时跳过并报错提示安装方式。
- **[音频下载耗时]** → 下载完整音频可能需要几分钟（取决于视频时长和网速）。→ 在脚本输出中显示进度提示。
- **[分块总结质量]** → 分块可能丢失跨块的语境联系。→ 每个分块包含适量重叠（overlap），SKILL.md 中指导 Claude 注意跨块关联。
