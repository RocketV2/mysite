# 我的日记 — 纯静态个人日记网站

一个纯静态的个人日记/人生记录网站，部署在 GitHub Pages 上。所有数据通过手动编辑静态 JSON 文件来更新，无需后端或构建工具。

## 功能

- **时间线视图** — 按日期倒序展示所有日记卡片，按年份分组
- **标签筛选** — 点击标签 chips 筛选，支持多选
- **心情筛选** — 下拉选择心情过滤
- **搜索** — 关键词搜索标题、内容、标签
- **展开/收起** — 点击卡片查看完整内容（基于 `<details>/<summary>`）
- **Markdown 渲染** — 通过 CDN 加载 marked.js 渲染内容
- **媒体支持** — 支持插入图片、视频、音频（URL / 本地文件 / 仓库路径），图片点击放大
- **在线编辑器** — `editor.html` 提供完整编辑功能，实时预览，自动保存
- **暗色/亮色模式** — 跟随系统偏好，支持手动切换
- **响应式设计** — 桌面端和移动端适配
- **URL 状态同步** — 筛选条件反映在 URL hash 中，可分享
- **单条日记页** — 点击标题进入独立页面

## 项目结构

```
mysite/
├── index.html           # 日记时间线页面
├── editor.html          # 在线编辑器
├── market-review.html   # 市场复盘页面
├── css/
│   ├── style.css        # 共享样式 + 主题系统
│   ├── editor.css       # 编辑器样式
│   └── market-review.css
├── js/
│   ├── main.js          # 时间线逻辑
│   ├── editor.js        # 编辑器逻辑
│   └── market-review.js
├── data/
│   ├── entries.json     # 日记条目数据
│   ├── market-review.json
│   └── images/          # 图片文件存放目录
└── README.md
```

## 使用方式

### 添加日记

编辑 `data/entries.json`，在 `entries` 数组中添加新条目：

```json
{
  "id": "2026-08-08-unique-id",
  "date": "2026-08-08",
  "title": "日记标题（可选）",
  "content": "## Markdown 内容\n\n支持 **加粗**、*斜体* 等。",
  "mood": "happy",
  "tags": ["生活", "技术"]
}
```

字段说明：

| 字段 | 必需 | 说明 |
|------|------|------|
| `id` | 是 | 唯一标识，建议用日期+短横线+描述 |
| `date` | 是 | 日期，格式 YYYY-MM-DD |
| `title` | 否 | 日记标题 |
| `content` | 否 | Markdown 格式的正文内容 |
| `mood` | 否 | 心情：`happy`/`sad`/`neutral`/`excited`/`anxious` |
| `tags` | 否 | 标签数组 |

### 本地预览

```bash
python3 -m http.server 9898
```

浏览器访问 `http://localhost:9898`

## 媒体使用指南

编辑器内置媒体插入功能（🎬 媒体按钮），支持**图片**、**视频**、**音频**三种媒体类型，每种支持三种插入方式：

### 媒体类型与插入格式

| 类型 | Markdown/HTML 格式 | 点击行为 |
|------|-------------------|---------|
| 🖼 图片 | `![描述](url)` | 点击放大（lightbox） |
| 🎬 视频 | `<video src="url" controls></video>` | 原生播放器 |
| 🎵 音频 | `<audio src="url" controls></audio>` | 原生播放器 |

### 方式一：仓库路径（推荐）

将媒体文件放入仓库目录，提交到 git，然后输入相对路径：

```markdown
![图片](data/images/photo.jpg)
<video src="data/videos/demo.mp4" controls></video>
<audio src="data/audios/podcast.mp3" controls></audio>
```

**优点**：文件与数据一起版本管理，永久有效，不依赖外部服务。

### 方式二：编辑器内嵌（适合小文件）

在编辑器中点击「🎬 媒体」→ 选择类型（图片/视频/音频）→「📁 选择文件」→ 选择本地文件，自动转为 Base64 内嵌。

> **注意**：图片限 500KB，视频/音频限 1MB。大文件建议使用方式一（仓库路径）。

### 方式三：外部 URL

粘贴外部链接（如 CDN、图床、对象存储）：

```markdown
![图片](https://cdn.example.com/photo.jpg)
<video src="https://cdn.example.com/video.mp4" controls></video>
```

### 查看图片

- 图片在日记卡片中自动响应式缩放
- **点击图片**可放大查看（lightbox），点击背景或按 ESC 关闭

## 部署到 GitHub Pages

1. 在 GitHub 创建仓库（如 `my-diary`）
2. 将项目文件推送到仓库
3. 进入仓库 Settings → Pages
4. Source 选择 `main` 分支，根目录 `/`，保存
5. 等待几分钟后访问 `https://<你的用户名>.github.io/<仓库名>/`

## 技术栈

- 纯 HTML/CSS/JS，无框架、无构建工具
- [marked.js](https://marked.js.org/) CDN 渲染 Markdown
- Markdown 图片语法 + Base64 内嵌支持
- CSS 自定义属性实现主题切换
- Hash 路由，无需服务端配置
- IIFE 模块模式，兼容 `file://` 和 GitHub Pages
- localStorage 编辑器自动保存
