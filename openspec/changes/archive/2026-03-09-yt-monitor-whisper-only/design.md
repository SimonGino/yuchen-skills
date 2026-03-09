## Context

`yt_subtitle_dl.py` 当前的音频转录采用两级 fallback：Gemini API（优先）→ mlx-whisper（本地）。实际使用中 mlx-whisper 表现稳定，Gemini API 增加了 API 密钥管理和网络依赖的复杂度。此外，MP3 下载没有去重机制——每次调用都会重新下载，即使文件已存在。

## Goals / Non-Goals

**Goals:**
- 移除 Gemini API 转录代码，简化为 mlx-whisper 单一路径
- 在 `_download_audio()` 中添加文件存在性检查，跳过已下载的 MP3
- 清理不再需要的 `GEMINI_API_KEY` / `GEMINI_BASE_URL` 配置读取

**Non-Goals:**
- 不改变字幕下载流程（manual → auto 策略不变）
- 不改变 text chunking 逻辑
- 不引入其他转录服务替代 Gemini

## Decisions

### 1. 直接删除 Gemini 代码而非保留为可选

**选择**: 完全删除 `_transcribe_gemini_inline`、`_transcribe_gemini_upload`、`_transcribe_gemini` 三个函数。

**理由**: Gemini 转录功能未被广泛使用，保留死代码增加维护负担。如果将来需要云端转录，可以重新添加。

### 2. MP3 去重采用文件存在性检查

**选择**: 在 `_download_audio()` 开头检查 `{video_id}_audio.mp3` 是否已存在，存在则跳过下载。

**理由**: 简单可靠。当前流程在转录成功后会删除 MP3，所以正常流程不会命中缓存。但如果前次转录失败（MP3 未被清理），再次运行时可以复用已下载的文件，避免重复下载。

**替代方案**: 维护已下载文件的 JSON 记录——过于复杂，文件存在性检查已足够。

### 3. mlx-whisper 未安装时的错误信息

**选择**: 简化错误信息，移除 Gemini 相关提示，仅提示安装 mlx-whisper。

**理由**: 与移除 Gemini 功能一致，避免用户困惑。

## Risks / Trade-offs

- **[mlx-whisper 成为唯一转录方式]** → 如果 mlx-whisper 未安装，无字幕视频将无法处理。可接受：用户按提示 `pip install mlx-whisper` 即可。
- **[Apple Silicon 限制]** → mlx-whisper 仅在 Apple Silicon Mac 上运行。当前使用场景为个人 Mac，不影响。
- **[MP3 残留文件]** → 转录失败时 MP3 不会被清理（当前已有此行为），去重检查反而让这成为优势——下次可复用。
