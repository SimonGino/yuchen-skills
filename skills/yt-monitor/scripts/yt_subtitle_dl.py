#!/usr/bin/env python3
"""
YouTube 字幕下载器
通过 yt-dlp 下载视频字幕（优先手动字幕，其次自动生成字幕），
转为纯文本供 Claude 阅读和总结。
无字幕时自动回退到本地 mlx-whisper 音频转录。
超长文本自动分块。
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

SKILL_DIR = Path(__file__).parent.parent

# 运行时数据存放在 ~/.wqq-skills/yt-monitor/，避免污染代码目录
DATA_DIR = Path.home() / ".wqq-skills" / "yt-monitor"
SUBTITLE_DIR = DATA_DIR / "subtitles"
# 字幕分块阈值（字符数）
CHUNK_THRESHOLD = 15000

# yt-dlp 认证参数：YouTube 强制要求 cookie 认证 + JS challenge 验证
YT_DLP_AUTH_ARGS = ["--cookies-from-browser", "chrome", "--remote-components", "ejs:github"]




def _ensure_mlx_whisper() -> bool:
    """检测 mlx-whisper 是否可用，未安装则自动安装。"""
    project = str(SKILL_DIR)

    def _is_installed() -> bool:
        try:
            subprocess.run(
                ["uv", "run", "--project", project, "python", "-c", "import mlx_whisper"],
                capture_output=True, timeout=30, check=True,
            )
            return True
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError):
            return False

    if _is_installed():
        return True

    # 未安装，自动安装
    print("     📦 mlx-whisper 未安装，正在自动安装（首次可能较慢）...", file=sys.stderr)
    try:
        subprocess.run(
            ["uv", "sync", "--project", project, "--extra", "transcribe"],
            capture_output=True, text=True, timeout=300, check=True,
        )
    except subprocess.TimeoutExpired:
        print("     ⚠️ mlx-whisper 安装超时", file=sys.stderr)
        return False
    except subprocess.CalledProcessError as e:
        print(f"     ⚠️ mlx-whisper 安装失败: {e.stderr[:500]}", file=sys.stderr)
        return False
    except FileNotFoundError:
        print("     ⚠️ uv 命令未找到，请确保已安装", file=sys.stderr)
        return False

    # 安装后再次确认
    if _is_installed():
        print("     ✅ mlx-whisper 安装成功", file=sys.stderr)
        return True

    print("     ⚠️ mlx-whisper 安装后仍无法导入", file=sys.stderr)
    return False


def ensure_yt_dlp():
    """检查 yt-dlp 和 deno 是否可用"""
    try:
        subprocess.run(["yt-dlp", "--version"], capture_output=True, check=True)
    except (FileNotFoundError, subprocess.CalledProcessError):
        print("错误: 请先安装 yt-dlp:\n  brew install yt-dlp\n  或 pip install yt-dlp", file=sys.stderr)
        return False
    try:
        subprocess.run(["deno", "--version"], capture_output=True, check=True)
    except (FileNotFoundError, subprocess.CalledProcessError):
        print("错误: 请先安装 deno（yt-dlp JS challenge 需要）:\n  curl -fsSL https://deno.land/install.sh | sh", file=sys.stderr)
        return False
    return True


# ── 音频下载与转录 ───────────────────────────────────────────────────────────


def _download_audio(url: str, output_dir: str, video_id: str) -> str | None:
    """用 yt-dlp 下载音频为 mp3 格式，返回文件路径或 None"""
    audio_path = os.path.join(output_dir, f"{video_id}_audio.mp3")
    if os.path.exists(audio_path):
        size_mb = os.path.getsize(audio_path) / (1024 * 1024)
        print(f"     🎵 复用已有音频: {size_mb:.1f}MB", file=sys.stderr)
        return audio_path
    cmd = [
        "yt-dlp", "-x", "--audio-format", "mp3",
        *YT_DLP_AUTH_ARGS,
        "-o", audio_path,
        url,
    ]
    try:
        print("     🎵 正在下载音频...", file=sys.stderr)
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode == 0 and os.path.exists(audio_path):
            size_mb = os.path.getsize(audio_path) / (1024 * 1024)
            print(f"     音频已下载: {size_mb:.1f}MB", file=sys.stderr)
            return audio_path
        if result.returncode != 0 and result.stderr:
            print(f"     ⚠️ yt-dlp stderr: {result.stderr[:500]}", file=sys.stderr)
    except subprocess.TimeoutExpired:
        print("     ⚠️ 音频下载超时", file=sys.stderr)
    except Exception as e:
        print(f"     ⚠️ 音频下载失败: {e}", file=sys.stderr)
    return None


def _cleanup_audio(audio_path: str):
    """清理临时音频文件"""
    try:
        if audio_path and os.path.exists(audio_path):
            os.remove(audio_path)
    except OSError:
        pass


def _transcribe_mlx_whisper(audio_path: str) -> str | None:
    """用本地 mlx-whisper CLI 转录音频，返回纯文本。"""
    print("     🤖 使用本地 mlx-whisper 转录（首次使用需下载 ~1.5GB 模型）...", file=sys.stderr)
    project = str(SKILL_DIR)
    cmd = [
        "uv", "run", "--project", project,
        "mlx_whisper", audio_path,
        "--model", "mlx-community/whisper-large-v3-turbo",
        "--language", "zh",
        "--output-format", "srt",
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        if result.returncode != 0:
            if result.stderr:
                print(f"     ⚠️ mlx-whisper stderr: {result.stderr[:500]}", file=sys.stderr)
            return None
        # mlx_whisper CLI 将 srt 写入与音频同目录的 .srt 文件
        srt_path = os.path.splitext(audio_path)[0] + ".srt"
        if os.path.exists(srt_path):
            with open(srt_path, "r", encoding="utf-8") as f:
                srt_content = f.read()
            os.remove(srt_path)  # 清理临时 srt 文件
            return _parse_srt_text(srt_content)
        # 回退：尝试从 stdout 解析
        if result.stdout.strip():
            return _parse_srt_text(result.stdout.strip())
        return None
    except subprocess.TimeoutExpired:
        print("     ⚠️ mlx-whisper 转录超时", file=sys.stderr)
    except Exception as e:
        print(f"     ⚠️ mlx-whisper 转录失败: {e}", file=sys.stderr)
    return None


def _parse_srt_text(srt_content: str) -> str:
    """从 srt 内容中提取纯文本（去除序号和时间戳）。"""
    lines = srt_content.strip().splitlines()
    text_lines = []
    for line in lines:
        line = line.strip()
        # 跳过序号行（纯数字）
        if re.match(r"^\d+$", line):
            continue
        # 跳过时间戳行
        if re.match(r"\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->", line):
            continue
        if line:
            text_lines.append(line)
    # 去重连续重复行
    deduped = []
    prev = ""
    for line in text_lines:
        if line != prev:
            deduped.append(line)
            prev = line
    return "\n".join(deduped)


def _transcribe_with_fallback(url: str, output_dir: str, video_id: str, title: str, channel: str, duration: int) -> dict:
    """
    下载音频 → mlx-whisper 本地转录 → 保存为 txt → 清理。
    返回与 download_subtitle() 相同结构的 dict。
    """
    audio_path = _download_audio(url, output_dir, video_id)
    if not audio_path:
        return {
            "success": False,
            "video_id": video_id, "title": title, "channel": channel, "duration": duration,
            "subtitle_file": None, "subtitle_lang": None, "subtitle_type": None,
            "text_length": 0, "chunked": False, "chunk_files": [],
            "error": "音频下载失败",
        }

    # 确保 mlx-whisper 可用（未安装则自动安装）
    if not _ensure_mlx_whisper():
        _cleanup_audio(audio_path)
        return {
            "success": False,
            "video_id": video_id, "title": title, "channel": channel, "duration": duration,
            "subtitle_file": None, "subtitle_lang": None, "subtitle_type": None,
            "text_length": 0, "chunked": False, "chunk_files": [],
            "error": "mlx-whisper 自动安装失败，请检查 stderr 输出（仅 Apple Silicon Mac）",
        }

    transcript = _transcribe_mlx_whisper(audio_path)

    # 清理音频
    _cleanup_audio(audio_path)

    if not transcript:
        return {
            "success": False,
            "video_id": video_id, "title": title, "channel": channel, "duration": duration,
            "subtitle_file": None, "subtitle_lang": None, "subtitle_type": None,
            "text_length": 0, "chunked": False, "chunk_files": [],
            "error": "mlx-whisper 转录失败，请检查 stderr 输出",
        }

    # 保存转录文本（与字幕格式一致）
    text_file = os.path.join(output_dir, f"{video_id}.txt")
    with open(text_file, "w", encoding="utf-8") as f:
        f.write(f"# {title}\n")
        f.write(f"频道: {channel}\n")
        f.write(f"链接: {url}\n")
        if duration:
            f.write(f"时长: {_format_duration(duration)}\n")
        f.write(f"来源: 音频转录 (mlx-whisper)\n")
        f.write(f"\n---\n\n")
        f.write(transcript.strip())
        f.write("\n")

    # 分块处理
    text_length, chunked, chunk_files = _check_and_chunk(text_file, video_id, output_dir, title, channel, url, duration)

    print(f"     ✅ 转录已保存: {text_file}", file=sys.stderr)
    print(f"     来源: mlx-whisper | 字符数: {text_length}", file=sys.stderr)

    return {
        "success": True,
        "video_id": video_id, "title": title, "channel": channel, "duration": duration,
        "subtitle_file": text_file, "subtitle_lang": "auto", "subtitle_type": "mlx-whisper",
        "text_length": text_length, "chunked": chunked, "chunk_files": chunk_files,
        "error": None,
    }


def _check_subtitles(url: str, lang: str) -> str | None:
    """
    用 yt-dlp --print JSON 检测字幕可用性。

    Returns:
        "manual" — 有手动字幕
        "auto"   — 仅有自动生成字幕
        "none"   — 确认无任何字幕
        None     — 检测失败（应回退到逐步尝试）
    """
    cmd = [
        "yt-dlp", "--skip-download",
        "--print", '{"subs": %(subtitles)j, "auto_subs": %(automatic_captions)j}',
        *YT_DLP_AUTH_ARGS,
        url,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            if result.stderr:
                print(f"     ⚠️ 字幕检测 yt-dlp stderr: {result.stderr[:500]}", file=sys.stderr)
            return None  # 检测失败，回退到逐步尝试

        try:
            sub_info = json.loads(result.stdout.strip().splitlines()[0])
        except (json.JSONDecodeError, IndexError):
            return None

        langs_set = {l.strip() for l in lang.split(",")}

        if any(k in langs_set for k in (sub_info.get("subs") or {})):
            return "manual"
        if any(k in langs_set for k in (sub_info.get("auto_subs") or {})):
            return "auto"
        return "none"
    except subprocess.TimeoutExpired:
        print("     ⚠️ 字幕检测超时", file=sys.stderr)
        return None
    except Exception as e:
        print(f"     ⚠️ 字幕检测失败: {e}", file=sys.stderr)
        return None


def get_video_info(url: str) -> dict:
    """获取视频基本信息（标题、频道、时长等）"""
    try:
        result = subprocess.run(
            ["yt-dlp", "--dump-json", "--no-download", *YT_DLP_AUTH_ARGS, url],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0:
            return json.loads(result.stdout)
        if result.stderr:
            print(f"  ⚠️ yt-dlp stderr: {result.stderr[:500]}", file=sys.stderr)
    except Exception as e:
        print(f"  ⚠️ 获取视频信息失败: {e}", file=sys.stderr)
    return {}


def download_subtitle(url: str, lang: str = "zh,zh-Hans,zh-CN,zh-TW,zh-Hant,en", output_dir: str = None) -> dict:
    """
    下载视频字幕。

    优先级：手动字幕 > 自动生成字幕
    语言优先级：zh（中文）> en（英文）

    Args:
        url: YouTube 视频 URL
        lang: 字幕语言偏好，逗号分隔
        output_dir: 输出目录，默认为 data/subtitles/

    Returns:
        {
            "success": bool,
            "video_id": str,
            "title": str,
            "channel": str,
            "duration": int,
            "subtitle_file": str,  # 纯文本字幕路径
            "subtitle_lang": str,
            "subtitle_type": "manual" | "auto",
            "error": str | None
        }
    """
    if output_dir is None:
        output_dir = str(SUBTITLE_DIR)

    os.makedirs(output_dir, exist_ok=True)

    # 先用 video_id 构建输出路径（从 URL 提取，避免额外调用）
    video_id = _extract_video_id(url)
    output_template = os.path.join(output_dir, f"{video_id}")

    # 预检字幕可用性
    sub_availability = _check_subtitles(url, lang)

    if sub_availability == "none":
        # 确认无字幕 — 直接走音频转录
        info = get_video_info(url)
        video_id = info.get("id", video_id)
        title = info.get("title", "unknown")
        channel = info.get("channel", info.get("uploader", "unknown"))
        duration = info.get("duration", 0)
        print(f"  📹 {title}")
        print(f"     频道: {channel} | 时长: {_format_duration(duration)}")
        print("     ⚠️ 该视频无字幕，将使用音频转录", file=sys.stderr)
        return _transcribe_with_fallback(url, output_dir, video_id, title, channel, duration)

    # sub_availability 为 "manual"/"auto"（预检成功）或 None（预检失败，回退逐步尝试）
    subtitle_file = None
    info = {}
    sub_type = sub_availability or "manual"

    if sub_availability != "auto":
        # 预检说有手动字幕，或预检失败先尝试手动
        subtitle_file, info = _try_download_sub(url, output_template, lang, auto=False, dump_json=True)

    if not subtitle_file:
        # 手动字幕下载失败或仅有自动字幕
        subtitle_file, auto_info = _try_download_sub(url, output_template, lang, auto=True, dump_json=not info)
        sub_type = "auto"
        if not info and auto_info:
            info = auto_info

    # 提取视频信息
    if info:
        video_id = info.get("id", video_id)
        title = info.get("title", "unknown")
        channel = info.get("channel", info.get("uploader", "unknown"))
        duration = info.get("duration", 0)
    else:
        title = "unknown"
        channel = "unknown"
        duration = 0

    print(f"  📹 {title}")
    print(f"     频道: {channel} | 时长: {_format_duration(duration)}")

    if not subtitle_file:
        # 字幕下载失败，回退到音频转录
        print("     ⚠️ 没有找到字幕，尝试音频转录回退...", file=sys.stderr)
        return _transcribe_with_fallback(url, output_dir, video_id, title, channel, duration)

    # 解析字幕语言
    sub_lang = _detect_subtitle_lang(subtitle_file)

    # 将 VTT/SRT 转为纯文本
    text_file = os.path.join(output_dir, f"{video_id}.txt")
    _convert_to_text(subtitle_file, text_file, title=title, channel=channel, url=url, duration=duration)

    # 清理原始字幕文件
    try:
        os.remove(subtitle_file)
    except OSError:
        pass

    # 分块处理
    text_length, chunked, chunk_files = _check_and_chunk(text_file, video_id, output_dir, title, channel, url, duration)

    print(f"     ✅ 字幕已保存: {text_file}")
    print(f"     语言: {sub_lang} | 类型: {'手动' if sub_type == 'manual' else '自动生成'} | 字符数: {text_length}")

    return {
        "success": True,
        "video_id": video_id,
        "title": title,
        "channel": channel,
        "duration": duration,
        "subtitle_file": text_file,
        "subtitle_lang": sub_lang,
        "subtitle_type": sub_type,
        "text_length": text_length,
        "chunked": chunked,
        "chunk_files": chunk_files,
        "error": None,
    }


def _try_download_sub(url: str, output_template: str, lang: str, auto: bool, dump_json: bool = False) -> tuple:
    """
    尝试下载字幕，可选同时获取视频信息。

    Args:
        url: 视频 URL
        output_template: 输出路径模板
        lang: 字幕语言
        auto: 是否下载自动字幕
        dump_json: 是否同时 --dump-json 获取视频信息

    Returns:
        (subtitle_file_path, video_info_dict)
        subtitle_file_path 为 None 表示没有下载到字幕
        video_info_dict 为 {} 表示没有请求或解析失败
    """
    cmd = [
        "yt-dlp",
        "--skip-download",
        "--sub-format", "vtt/srt/best",
        "--sub-lang", lang,
        *YT_DLP_AUTH_ARGS,
        "-o", output_template,
    ]
    if dump_json:
        cmd.append("--dump-json")
    if auto:
        cmd.append("--write-auto-sub")
    else:
        cmd.append("--write-sub")
    cmd.append(url)

    info = {}
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode != 0 and result.stderr:
            print(f"     ⚠️ yt-dlp stderr: {result.stderr[:500]}", file=sys.stderr)
        if dump_json and result.stdout.strip():
            try:
                info = json.loads(result.stdout)
            except json.JSONDecodeError:
                pass
    except subprocess.TimeoutExpired:
        return None, info

    # 查找生成的字幕文件
    base_dir = os.path.dirname(output_template)
    base_name = os.path.basename(output_template)
    for f in os.listdir(base_dir):
        if f.startswith(base_name) and (f.endswith(".vtt") or f.endswith(".srt")):
            return os.path.join(base_dir, f), info

    return None, info


def _convert_to_text(sub_file: str, text_file: str, title: str = "", channel: str = "", url: str = "", duration: int = 0):
    """将 VTT/SRT 字幕转为干净的纯文本"""
    with open(sub_file, "r", encoding="utf-8") as f:
        content = f.read()

    # 去掉 VTT 头部
    content = re.sub(r"^WEBVTT\n.*?\n\n", "", content, flags=re.DOTALL)
    # 去掉时间戳行
    content = re.sub(r"\d{2}:\d{2}:\d{2}[\.,]\d{3}\s*-->.*\n", "", content)
    # 去掉 SRT 序号行
    content = re.sub(r"^\d+\s*$", "", content, flags=re.MULTILINE)
    # 去掉 VTT 位置标记
    content = re.sub(r"<[^>]+>", "", content)
    content = re.sub(r"align:.*|position:.*", "", content)
    # 去掉重复行（自动字幕常见）
    lines = content.strip().split("\n")
    deduped = []
    prev = ""
    for line in lines:
        line = line.strip()
        if line and line != prev:
            deduped.append(line)
            prev = line

    # 合并为段落（空行间隔的视为不同段落）
    text = "\n".join(deduped)
    # 多个连续空行合并为一个
    text = re.sub(r"\n{3,}", "\n\n", text)

    # 写入带元信息的头部
    with open(text_file, "w", encoding="utf-8") as f:
        f.write(f"# {title}\n")
        f.write(f"频道: {channel}\n")
        f.write(f"链接: {url}\n")
        if duration:
            f.write(f"时长: {_format_duration(duration)}\n")
        f.write(f"\n---\n\n")
        f.write(text.strip())
        f.write("\n")


# ── 字幕分块 ─────────────────────────────────────────────────────────────────


def _check_and_chunk(text_file: str, video_id: str, output_dir: str,
                     title: str, channel: str, url: str, duration: int) -> tuple[int, bool, list[str]]:
    """
    检测文本长度，超过阈值时按段落边界分块。

    Returns:
        (text_length, chunked, chunk_files)
    """
    with open(text_file, "r", encoding="utf-8") as f:
        content = f.read()

    # 分离元信息头和正文（以 "---\n\n" 分隔）
    parts = content.split("\n---\n\n", 1)
    if len(parts) == 2:
        body = parts[1]
    else:
        body = content

    text_length = len(body.strip())

    if text_length <= CHUNK_THRESHOLD:
        return text_length, False, [os.path.basename(text_file)]

    # 按段落（双换行）切分
    paragraphs = re.split(r"\n\n+", body.strip())
    chunks: list[list[str]] = []
    current_chunk: list[str] = []
    current_len = 0

    for para in paragraphs:
        para_len = len(para)
        if current_len + para_len > CHUNK_THRESHOLD and current_chunk:
            chunks.append(current_chunk)
            current_chunk = []
            current_len = 0
        current_chunk.append(para)
        current_len += para_len + 2  # +2 for \n\n

    if current_chunk:
        chunks.append(current_chunk)

    if len(chunks) <= 1:
        return text_length, False, [os.path.basename(text_file)]

    # 写入分块文件
    chunk_files = []
    total = len(chunks)
    for i, chunk_paras in enumerate(chunks, 1):
        chunk_path = os.path.join(output_dir, f"{video_id}_part{i}.txt")
        with open(chunk_path, "w", encoding="utf-8") as f:
            f.write(f"# {title}\n")
            f.write(f"频道: {channel}\n")
            f.write(f"链接: {url}\n")
            if duration:
                f.write(f"时长: {_format_duration(duration)}\n")
            f.write(f"分块: {i}/{total}\n")
            f.write(f"\n---\n\n")
            # 重叠：非第一块时包含上一块最后一段
            if i > 1 and chunks[i - 2]:
                overlap = chunks[i - 2][-1]
                f.write(f"[上文重叠]\n{overlap}\n[/上文重叠]\n\n")
            f.write("\n\n".join(chunk_paras))
            f.write("\n")
        chunk_files.append(os.path.basename(chunk_path))

    print(f"     📦 文本已分块: {total} 块（每块 ≤{CHUNK_THRESHOLD} 字符）", file=sys.stderr)
    return text_length, True, chunk_files


def _extract_video_id(url: str) -> str:
    """从 URL 提取 video ID"""
    patterns = [
        r"v=([a-zA-Z0-9_-]{11})",
        r"youtu\.be/([a-zA-Z0-9_-]{11})",
        r"/shorts/([a-zA-Z0-9_-]{11})",
    ]
    for p in patterns:
        m = re.search(p, url)
        if m:
            return m.group(1)
    return "unknown"


def _detect_subtitle_lang(filepath: str) -> str:
    """从文件名检测字幕语言"""
    name = os.path.basename(filepath)
    if ".zh" in name or ".zh-Hans" in name or ".zh-CN" in name or ".zh-TW" in name or ".zh-Hant" in name:
        return "zh"
    if ".en" in name:
        return "en"
    if ".ja" in name:
        return "ja"
    return "unknown"


def _format_duration(seconds: int) -> str:
    """格式化秒数为可读时长"""
    if not seconds:
        return "未知"
    h, r = divmod(seconds, 3600)
    m, s = divmod(r, 60)
    if h > 0:
        return f"{h}h{m:02d}m"
    return f"{m}m{s:02d}s"


def download_batch(urls: list[str], lang: str = "zh,zh-Hans,zh-CN,zh-TW,zh-Hant,en", output_dir: str = None) -> list[dict]:
    """批量下载字幕"""
    results = []
    for i, url in enumerate(urls, 1):
        print(f"\n[{i}/{len(urls)}] {url}")
        result = download_subtitle(url, lang=lang, output_dir=output_dir)
        results.append(result)

    # 汇总
    success = sum(1 for r in results if r["success"])
    print(f"\n📊 下载完成: {success}/{len(results)} 成功")
    for r in results:
        status = "✅" if r["success"] else "❌"
        print(f"  {status} {r['title'][:50]}")
        if r.get("error"):
            print(f"     {r['error']}")

    return results


# ── CLI ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="YouTube 字幕下载器")
    subparsers = parser.add_subparsers(dest="command")

    # download 命令
    dl_parser = subparsers.add_parser("download", help="下载字幕")
    dl_parser.add_argument("urls", nargs="+", help="YouTube 视频 URL")
    dl_parser.add_argument("--lang", default="zh,zh-Hans,zh-CN,zh-TW,zh-Hant,en", help="字幕语言偏好（默认: zh,zh-Hans,zh-CN,zh-TW,zh-Hant,en）")
    dl_parser.add_argument("--output", default=None, help="输出目录")

    # info 命令
    info_parser = subparsers.add_parser("info", help="查看视频信息")
    info_parser.add_argument("url", help="YouTube 视频 URL")

    args = parser.parse_args()

    if not ensure_yt_dlp():
        sys.exit(1)

    if args.command == "download":
        results = download_batch(args.urls, lang=args.lang, output_dir=args.output)
        success = all(r["success"] for r in results)
        # 输出 JSON 结果到 stdout（方便被其他脚本读取）
        print("\n" + json.dumps(results, ensure_ascii=False, indent=2))
        sys.exit(0 if success else 1)

    elif args.command == "info":
        info = get_video_info(args.url)
        if info:
            print(json.dumps({
                "id": info.get("id"),
                "title": info.get("title"),
                "channel": info.get("channel", info.get("uploader")),
                "duration": info.get("duration"),
                "upload_date": info.get("upload_date"),
                "view_count": info.get("view_count"),
                "description": info.get("description", "")[:500],
            }, ensure_ascii=False, indent=2))
        else:
            print("获取视频信息失败", file=sys.stderr)
            sys.exit(1)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
