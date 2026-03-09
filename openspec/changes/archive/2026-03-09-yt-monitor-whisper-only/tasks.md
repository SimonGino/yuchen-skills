## 1. 移除 Gemini 转录代码

- [x] 1.1 删除 `_transcribe_gemini_inline()` 函数（约 L107-131）
- [x] 1.2 删除 `_transcribe_gemini_upload()` 函数（约 L134-201）
- [x] 1.3 删除 `_transcribe_gemini()` 路由函数（约 L204-211）
- [x] 1.4 移除 `_load_env()` 中 `GEMINI_API_KEY` 和 `GEMINI_BASE_URL` 的读取
- [x] 1.5 移除文件顶部 `base64` import（仅 Gemini inline 使用）

## 2. 简化转录流程

- [x] 2.1 重写 `_transcribe_with_fallback()`：移除 Gemini 分支，直接调用 mlx-whisper
- [x] 2.2 更新错误信息：mlx-whisper 未安装时不再提及 Gemini API
- [x] 2.3 确保 `subtitle_type` 仅返回 `"mlx-whisper"`，不再有 `"gemini"` 类型

## 3. MP3 下载去重

- [x] 3.1 在 `_download_audio()` 开头添加文件存在性检查，已存在则跳过下载并打印日志
- [x] 3.2 验证转录失败时 MP3 未被清理的场景下，重跑可复用已有文件

## 4. 验证与清理

- [x] 4.1 运行 typecheck 确认无类型错误
- [x] 4.2 端到端测试：有字幕视频正常下载字幕
- [x] 4.3 端到端测试：无字幕视频通过 mlx-whisper 转录
- [x] 4.4 确认 SKILL.md 中 Gemini 相关说明已更新
