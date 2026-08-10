# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

纯静态个人日记网站，部署在 GitHub Pages。无框架、无构建工具，所有数据通过手动编辑 JSON 文件更新。

## 本地开发

```bash
python3 -m http.server 9898
```

浏览器访问 `http://localhost:9898`。fetch 加载 `data/entries.json` 需要通过 HTTP 服务，不能使用 `file://` 协议。

## 架构

### 数据流

```
data/entries.json  ──fetch──>  js/main.js (IIFE)  ──renders──>  index.html
                                    │
                                    ├── timeline view (默认, 按年份分组)
                                    └── single entry view (#/entry/<id>)
```

- **数据源**：`data/entries.json` — 唯一的数据文件，包含 `entries` 数组。手动编辑，无后端。
- **JS 架构**：IIFE 模块模式，无全局变量污染。核心函数按职责分为：数据加载 → 筛选逻辑 → 渲染（timeline/单条） → 路由 → UI 更新。
- **路由**：基于 `window.location.hash`。格式：`#/timeline`（含可选筛选参数）或 `#/entry/<id>`。筛选参数通过 hash 持久化（`#tag=...&mood=...&q=...`），`history.replaceState` 避免产生历史记录。
- **渲染**：`<details>/<summary>` 实现卡片展开/收起；marked.js CDN 渲染 Markdown 内容。

### 主题系统

三层优先级（从高到低）：
1. 手动切换：通过 `.dark` / `.light` 类名覆盖 CSS 变量，存 `localStorage("theme")`
2. 系统偏好：`@media (prefers-color-scheme: dark)` 设置 CSS 变量默认值
3. `:root` 中的亮色默认值

CSS 自定义属性（`--color-*`, `--shadow-*`, `--radius`, `--max-width`）集中在 `:root` 声明，暗色模式覆写值。

### 筛选逻辑

标签筛选使用 AND 逻辑（多选 = 必须同时满足）。搜索匹配标题、内容、标签三者任意命中（OR 逻辑）。

### 条目 ID 约定

格式：`YYYY-MM-DD-short-description`（如 `2026-08-07-first-day`），用于唯一标识和单条路由。

### 心情值

`happy` | `sad` | `neutral` | `excited` | `anxious`

## Markdown 编辑器 (`editor.html`)

独立页面，提供完整的日记编辑功能。

### 数据持久化策略

```
entries.json ──fetch──> 合并 ──> localStorage (diary_editor_entries)
                              │
                              用户编辑 → auto-save 600ms debounce → localStorage
                              删除 → diary_editor_deleted 列表
```

- 首次加载时从 `entries.json` 读取并缓存到 localStorage
- 后续加载优先使用 localStorage（保留用户编辑），同时合并 entries.json 中新增的条目
- 自动保存：每次编辑触发 600ms 防抖后写入 localStorage
- 「重新加载」按钮丢弃 localStorage 并从 entries.json 重新读取
- 导出 JSON 下载完整的 `entries.json`（用户手动替换 repo 中的数据文件）

### 编辑器架构

- **侧边栏**：可搜索的条目列表，点击切换编辑目标
- **元数据表单**：日期、心情、标题、标签（chips 输入，回车添加，Backspace 删除）
- **编辑/预览双栏**：桌面端左右分栏，移动端 Tab 切换
- **标签输入**：自定义 tag chips 组件，支持添加/删除
- **Toast 通知**：操作反馈（成功/错误/信息）
- **确认对话框**：删除操作前确认

### 导入/导出格式

| 功能 | 格式 | 说明 |
|------|------|------|
| 导出 JSON | `entries.json` | 所有条目的完整数据 |
| 导出 Markdown | `.md` | 单条日记，含 YAML frontmatter（date/title/mood/tags） |
| 导入 JSON | `.json` | 按 id 合并（更新同名条目，新增不存在的） |
| 导入 Markdown | `.md` | 解析 frontmatter，创建新条目 |
