#!/usr/bin/env python3
"""
YouTube 字幕下载器
通过 yt-dlp 下载视频字幕（优先手动字幕，其次自动生成字幕），
转为纯文本供 Claude 阅读和总结。
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


def ensure_yt_dlp():
    """检查 yt-dlp 是否可用"""
    try:
        subprocess.run(["yt-dlp", "--version"], capture_output=True, check=True)
        return True
    except (FileNotFoundError, subprocess.CalledProcessError):
        print("错误: 请先安装 yt-dlp:\n  brew install yt-dlp\n  或 pip install yt-dlp", file=sys.stderr)
        return False


def get_video_info(url: str) -> dict:
    """获取视频基本信息（标题、频道、时长等）"""
    try:
        result = subprocess.run(
            ["yt-dlp", "--dump-json", "--no-download", url],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0:
            return json.loads(result.stdout)
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

    # 策略1: 尝试下载手动字幕（同时获取视频信息）
    subtitle_file, info = _try_download_sub(url, output_template, lang, auto=False, dump_json=True)
    sub_type = "manual"

    # 从合并调用中提取视频信息
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

    # 策略2: 尝试下载自动生成字幕
    if not subtitle_file:
        subtitle_file, auto_info = _try_download_sub(url, output_template, lang, auto=True, dump_json=not info)
        sub_type = "auto"
        # 如果第一次没拿到 info，用第二次的
        if not info and auto_info:
            info = auto_info
            video_id = info.get("id", video_id)
            title = info.get("title", title)
            channel = info.get("channel", info.get("uploader", channel))
            duration = info.get("duration", duration)

    if not subtitle_file:
        return {
            "success": False,
            "video_id": video_id,
            "title": title,
            "channel": channel,
            "duration": duration,
            "subtitle_file": None,
            "subtitle_lang": None,
            "subtitle_type": None,
            "error": "没有找到可用字幕（手动和自动都不存在）",
        }

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

    print(f"     ✅ 字幕已保存: {text_file}")
    print(f"     语言: {sub_lang} | 类型: {'手动' if sub_type == 'manual' else '自动生成'}")

    return {
        "success": True,
        "video_id": video_id,
        "title": title,
        "channel": channel,
        "duration": duration,
        "subtitle_file": text_file,
        "subtitle_lang": sub_lang,
        "subtitle_type": sub_type,
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
