#!/usr/bin/env python3
"""
YouTube RSS Monitor
检测关注的 YouTube 频道是否有新视频发布。
通过 YouTube RSS Feed 实现，无需 API Key。
"""
from __future__ import annotations

import json
import os
import sys
import re
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

# 项目根目录
SKILL_DIR = Path(__file__).parent.parent
CONFIG_PATH = SKILL_DIR / "config" / "channels.json"
PROCESSED_PATH = SKILL_DIR / "data" / "processed.json"

# YouTube RSS Feed 模板
RSS_FEED_URL = "https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"

# Atom 命名空间
ATOM_NS = "http://www.w3.org/2005/Atom"
YT_NS = "http://www.youtube.com/xml/schemas/2015"
MEDIA_NS = "http://search.yahoo.com/mrss/"


def load_config() -> dict:
    """加载频道配置"""
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_config(config: dict):
    """保存频道配置"""
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)


def load_processed() -> dict:
    """加载已处理的视频记录"""
    if not PROCESSED_PATH.exists():
        return {"processed_videos": {}}
    with open(PROCESSED_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_processed(processed: dict):
    """保存已处理的视频记录"""
    with open(PROCESSED_PATH, "w", encoding="utf-8") as f:
        json.dump(processed, f, ensure_ascii=False, indent=2)


def fetch_url(url: str, timeout: int = 15) -> str:
    """获取 URL 内容"""
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    })
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8")


def resolve_channel_id(channel_url: str) -> str:
    """
    从频道 URL 解析 channel_id。
    支持格式：
    - https://www.youtube.com/@handle
    - https://www.youtube.com/channel/UCxxxxxx
    - https://www.youtube.com/c/ChannelName
    """
    # 如果已经是 channel ID 格式
    if "/channel/UC" in channel_url:
        match = re.search(r"/channel/(UC[\w-]+)", channel_url)
        if match:
            return match.group(1)

    # 访问频道页面，从 HTML 中提取 channel_id
    try:
        html = fetch_url(channel_url)

        # 方法1: 从 meta 标签获取
        # <meta property="og:url" content="https://www.youtube.com/channel/UCxxxxxx">
        match = re.search(
            r'<link\s+rel="canonical"\s+href="https://www\.youtube\.com/channel/(UC[\w-]+)"',
            html
        )
        if match:
            return match.group(1)

        # 方法2: 从 RSS link 获取
        match = re.search(
            r'channel_id=(UC[\w-]+)',
            html
        )
        if match:
            return match.group(1)

        # 方法3: 从 JSON 数据中获取
        match = re.search(
            r'"channelId"\s*:\s*"(UC[\w-]+)"',
            html
        )
        if match:
            return match.group(1)

        # 方法4: 从 externalId 获取
        match = re.search(
            r'"externalId"\s*:\s*"(UC[\w-]+)"',
            html
        )
        if match:
            return match.group(1)

    except Exception as e:
        print(f"  [错误] 访问频道页面失败: {e}", file=sys.stderr)

    return ""


def fetch_channel_feed(channel_id: str) -> list[dict]:
    """
    获取频道的 RSS Feed 并解析视频列表。
    返回: [{video_id, title, url, published, channel_name}]
    """
    feed_url = RSS_FEED_URL.format(channel_id=channel_id)
    try:
        xml_content = fetch_url(feed_url)
    except urllib.error.HTTPError as e:
        print(f"  [错误] 获取 RSS Feed 失败 (HTTP {e.code}): {feed_url}", file=sys.stderr)
        return []
    except Exception as e:
        print(f"  [错误] 获取 RSS Feed 失败: {e}", file=sys.stderr)
        return []

    try:
        root = ET.fromstring(xml_content)
    except ET.ParseError as e:
        print(f"  [错误] 解析 RSS XML 失败: {e}", file=sys.stderr)
        return []

    videos = []
    channel_name = ""

    # 获取频道名称
    title_el = root.find(f"{{{ATOM_NS}}}title")
    if title_el is not None and title_el.text:
        channel_name = title_el.text

    # 解析视频条目
    for entry in root.findall(f"{{{ATOM_NS}}}entry"):
        video_id_el = entry.find(f"{{{YT_NS}}}videoId")
        title_el = entry.find(f"{{{ATOM_NS}}}title")
        published_el = entry.find(f"{{{ATOM_NS}}}published")
        link_el = entry.find(f"{{{ATOM_NS}}}link")

        if video_id_el is None or title_el is None:
            continue

        video_id = video_id_el.text or ""
        title = title_el.text or ""
        published = published_el.text if published_el is not None else ""
        url = link_el.get("href", "") if link_el is not None else f"https://www.youtube.com/watch?v={video_id}"

        # 获取媒体描述（可选）
        media_group = entry.find(f"{{{MEDIA_NS}}}group")
        description = ""
        if media_group is not None:
            desc_el = media_group.find(f"{{{MEDIA_NS}}}description")
            if desc_el is not None and desc_el.text:
                description = desc_el.text[:200]  # 截取前200字符

        videos.append({
            "video_id": video_id,
            "title": title,
            "url": url,
            "published": published,
            "channel_name": channel_name,
            "description": description,
        })

    return videos


def check_new_videos(days: int = 7, channel_filter: str = None) -> list[dict]:
    """
    检查所有频道的新视频。

    Args:
        days: 检查最近几天的视频（默认7天）
        channel_filter: 按频道名称过滤（子字符串匹配，大小写不敏感）

    Returns:
        新视频列表 [{video_id, title, url, published, channel_name}]
    """
    config = load_config()
    processed = load_processed()
    processed_ids = set(processed.get("processed_videos", {}).keys())

    all_new_videos = []

    channels = config.get("channels", [])
    if channel_filter:
        filter_lower = channel_filter.lower()
        channels = [ch for ch in channels if filter_lower in ch.get("name", "").lower()]
        if not channels:
            print(f"  ⚠️ 没有匹配 \"{channel_filter}\" 的频道", file=sys.stderr)
            return []

    for channel in channels:
        name = channel.get("name", "未知频道")
        channel_id = channel.get("channel_id", "")

        print(f"\n📺 检查频道: {name}", file=sys.stderr)

        # 如果没有 channel_id，尝试解析
        if not channel_id:
            url = channel.get("url", "")
            if not url:
                print(f"  [跳过] 没有频道 URL", file=sys.stderr)
                continue

            print(f"  正在解析 channel_id...", file=sys.stderr)
            channel_id = resolve_channel_id(url)
            if channel_id:
                channel["channel_id"] = channel_id
                save_config(config)
                print(f"  ✅ channel_id: {channel_id}", file=sys.stderr)
            else:
                print(f"  [错误] 无法解析 channel_id", file=sys.stderr)
                continue

        # 获取 RSS Feed
        videos = fetch_channel_feed(channel_id)
        print(f"  获取到 {len(videos)} 个视频", file=sys.stderr)

        # 过滤新视频
        cutoff = datetime.now(timezone.utc).timestamp() - (days * 86400)
        new_videos = []
        for v in videos:
            if v["video_id"] in processed_ids:
                continue
            # 检查发布时间
            try:
                pub_dt = datetime.fromisoformat(v["published"].replace("Z", "+00:00"))
                if pub_dt.timestamp() < cutoff:
                    continue
            except (ValueError, AttributeError):
                pass  # 无法解析时间，仍然包含
            new_videos.append(v)

        if new_videos:
            print(f"  🆕 发现 {len(new_videos)} 个新视频:", file=sys.stderr)
            for v in new_videos:
                print(f"     - {v['title']}", file=sys.stderr)
                print(f"       {v['url']}", file=sys.stderr)
                print(f"       发布时间: {v['published']}", file=sys.stderr)
        else:
            print(f"  没有新视频", file=sys.stderr)

        all_new_videos.extend(new_videos)

    return all_new_videos


def mark_as_processed(videos: list[dict]):
    """将视频标记为已处理"""
    processed = load_processed()
    for v in videos:
        processed["processed_videos"][v["video_id"]] = {
            "title": v["title"],
            "channel": v.get("channel_name", ""),
            "imported_at": datetime.now(timezone.utc).isoformat(),
        }
    save_processed(processed)


def add_channel(name: str, url: str):
    """添加新的监控频道"""
    config = load_config()

    # 检查是否已存在
    for ch in config.get("channels", []):
        if ch.get("url") == url or ch.get("name") == name:
            print(f"频道 '{name}' 已在监控列表中")
            return

    # 解析 channel_id
    print(f"正在解析频道 ID...")
    channel_id = resolve_channel_id(url)

    new_channel = {
        "name": name,
        "handle": "",
        "url": url,
        "channel_id": channel_id,
        "notebook_id": "",
    }

    config.setdefault("channels", []).append(new_channel)
    save_config(config)
    print(f"✅ 已添加频道: {name}")
    if channel_id:
        print(f"   channel_id: {channel_id}")
    else:
        print(f"   ⚠️ 未能自动解析 channel_id，首次检查时会重试")


def list_channels():
    """列出所有监控的频道"""
    config = load_config()
    channels = config.get("channels", [])

    if not channels:
        print("当前没有监控任何频道")
        return

    print(f"\n📋 监控频道列表 ({len(channels)} 个):\n")
    for i, ch in enumerate(channels, 1):
        status = "✅" if ch.get("channel_id") else "⚠️ 未解析"
        print(f"  {i}. {ch['name']} {status}")
        print(f"     URL: {ch.get('url', 'N/A')}")
        if ch.get("channel_id"):
            print(f"     Channel ID: {ch['channel_id']}")
        print()


# ── CLI ────────────────────────────────────────────────────────────────────

def main():
    import argparse

    parser = argparse.ArgumentParser(description="YouTube 频道 RSS 监控")
    subparsers = parser.add_subparsers(dest="command", help="可用命令")

    # check 命令
    check_parser = subparsers.add_parser("check", help="检查频道新视频")
    check_parser.add_argument("--days", type=int, default=7, help="检查最近几天（默认7天）")
    check_parser.add_argument("--json", action="store_true", help="以 JSON 格式输出")
    check_parser.add_argument("--channel", type=str, default=None, help="按频道名称过滤（子字符串匹配）")

    # add 命令
    add_parser = subparsers.add_parser("add", help="添加监控频道")
    add_parser.add_argument("name", help="频道名称")
    add_parser.add_argument("url", help="频道 URL")

    # list 命令
    subparsers.add_parser("list", help="列出所有监控频道")

    args = parser.parse_args()

    if args.command == "check":
        new_videos = check_new_videos(days=args.days, channel_filter=args.channel)
        if args.json:
            print(json.dumps(new_videos, ensure_ascii=False, indent=2))
        elif not new_videos:
            print(f"\n✅ 所有频道均无新视频更新")
        else:
            print(f"\n📊 共发现 {len(new_videos)} 个新视频")
    elif args.command == "add":
        add_channel(args.name, args.url)
    elif args.command == "list":
        list_channels()
    else:
        # 默认：检查新视频
        new_videos = check_new_videos()
        if not new_videos:
            print(f"\n✅ 所有频道均无新视频更新")
        else:
            print(f"\n📊 共发现 {len(new_videos)} 个新视频")


if __name__ == "__main__":
    main()
