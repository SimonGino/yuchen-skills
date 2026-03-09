## 1. 基础设施

- [x] 1.1 在 `yt_subtitle_dl.py` 中添加 `.env` 文件读取函数（解析 `~/.wqq-skills/.env` 获取 `GEMINI_API_KEY`）
- [x] 1.2 添加 mlx-whisper 可用性检测函数 `_check_mlx_whisper()`

## 2. 音频下载

- [x] 2.1 实现 `_download_audio()` 函数：用 `yt-dlp -x --audio-format mp3` 下载音频到临时路径
- [x] 2.2 实现临时文件清理逻辑：确保 mp3 文件在转录完成/失败后被删除

## 3. Gemini API 转录（首选）

- [x] 3.1 实现 `_transcribe_gemini_inline()` 函数：音频 ≤ 20MB 时，base64 编码后 inline 传入 Gemini `generateContent` REST API
- [x] 3.2 实现 `_transcribe_gemini_upload()` 函数：音频 > 20MB 时，通过 Gemini Files API 上传后引用 URI 调用 `generateContent`
- [x] 3.3 实现 `_transcribe_gemini()` 主函数：根据文件大小选择 inline 或 upload 路径，返回转录文本

## 4. 本地 mlx-whisper 转录（兜底）

- [x] 4.1 实现 `_transcribe_mlx_whisper()` 函数：调用 mlx-whisper 的 `transcribe()` API，使用 large-v3-turbo 模型转录音频，返回文本

## 5. 转录回退串联

- [x] 5.1 实现 `_transcribe_with_fallback()` 主函数：下载音频 → 尝试 Gemini API → 失败则尝试 mlx-whisper → 保存为 txt → 清理临时文件
- [x] 5.2 在 `download_subtitle()` 中集成：当字幕下载失败时自动调用 `_transcribe_with_fallback()`，返回 `subtitle_type: "gemini"` 或 `"mlx-whisper"`

## 6. 字幕分块

- [x] 6.1 实现 `_check_and_chunk()` 函数：检测文本长度，超过 15000 字符时按段落边界分块
- [x] 6.2 实现分块文件写入：生成 `{video_id}_part{N}.txt`，每个分块包含元信息头和分块标识（`分块: N/total`）
- [x] 6.3 实现分块重叠：每个分块（除第一块）包含上一块最后一个段落，用 `[上文重叠]` / `[/上文重叠]` 标记
- [x] 6.4 在 `download_subtitle()` 返回值中增加 `text_length`、`chunked`、`chunk_files` 字段
- [x] 6.5 在 `_convert_to_text()` 结束后调用 `_check_and_chunk()`，对字幕和转录文本执行分块

## 7. 文档更新

- [x] 7.1 更新 SKILL.md：添加无字幕回退流程说明（Gemini API 转录 + mlx-whisper 兜底）
- [x] 7.2 更新 SKILL.md：添加长字幕分块处理指引（分段阅读 → 分段总结 → 合并总结）
- [x] 7.3 更新 SKILL.md：在前置条件中注明 mlx-whisper 可选安装，在故障处理中补充新的错误场景

## 8. 测试验证

- [x] 8.1 测试：有字幕的视频仍然正常下载字幕（不触发转录）
- [x] 8.2 测试：无字幕视频触发 Gemini API 音频转录回退
- [x] 8.3 测试：Gemini API 不可用时回退到 mlx-whisper（mlx-whisper 未安装，代码路径已验证正确，跳过时给出安装提示）
- [x] 8.4 测试：长字幕文本正确分块，分块文件格式正确
- [x] 8.5 测试：返回值包含新增字段（text_length、chunked、chunk_files）
