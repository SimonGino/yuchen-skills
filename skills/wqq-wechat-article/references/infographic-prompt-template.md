# Infographic Prompt Template (for wqq-image-gen)

目标：生成“信息密度高但不拥挤”的公众号配图（信息图/示意图）。

## WeChat Cover (Dual Crop, MUST)

公众号封面是单独类型，不按普通信息图处理。目标是一张图同时兼容微信的 `1:1` 与 `2.35:1` 裁切。

### Hard Constraints

- Canvas ratio: `2.35:1` (recommended `2350x1000`)
- Center safe area: `1:1` square, centered, width = `42.55%` of full canvas
- Side wings: left and right `28.72%` each, decoration/background only
- ALL critical elements inside safe area: main subject, title, logo
- No edge-aligned key text, no watermark, no busy background

### Cover Prompt (English)

```
Create a WeChat article cover image that supports dual crop.
Canvas ratio: 2.35:1 landscape.
Critical safe area: centered 1:1 square occupying 42.55% of canvas width.
Place ALL key elements inside the safe area: main subject, title, logo.
Use side areas only for background extension and atmosphere.
Readable at small size, high contrast, minimal text, no watermark, no busy background.
```

## Per-Image Spec

### 1) Purpose

- What does this image teach?
- Where will it be placed in the article?

### 2) Key Content (Chinese)

- Title (<= 12 Chinese characters)
- 3-6 bullet points
- Optional: small footer note (source/remark)

### 3) Layout

- Prefer: clean grid-cards / flow / do-dont / checklist
- Keep large margins, avoid tiny text

### 4) Style

- Modern, minimal, high contrast
- Flat vector or clean infographic
- No excessive decoration

### 5) Aspect Ratio Rules

- Cover image: `2.35:1` + centered `1:1` safe area (mandatory)
- Infographic default: `1:1`
- Infographic alternative: `9:16` (for long step-by-step)

## Prompt (English)

Use this structure for `/wqq-image-gen`:

```
Create a clean modern infographic in Chinese.
Topic: <topic>.
Layout: <layout>.
Include title: "<Chinese title>".
Include bullet points (Chinese):
- ...
- ...
Design constraints:
- High contrast, minimal style, lots of whitespace
- Clear hierarchy (title > section headers > bullets)
- Avoid tiny text, avoid clutter
- No watermark
- If this is a WeChat cover: keep key elements inside centered `1:1` safe area
```

If you need a diagram:

```
Create a clean schematic diagram in Chinese.
Show: <components and arrows>.
Use labeled boxes and arrows, simple icons.
Design constraints:
- Minimal, high contrast, readable labels
- No photorealism, no busy background
```
