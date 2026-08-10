# 我的日记 — 纯静态个人日记网站

一个纯静态的个人日记/人生记录网站，部署在 GitHub Pages 上。所有数据通过手动编辑静态 JSON 文件来更新，无需后端或构建工具。

## 功能

- **时间线视图** — 按日期倒序展示所有日记卡片，按年份分组
- **标签筛选** — 点击标签 chips 筛选，支持多选
- **心情筛选** — 下拉选择心情过滤
- **搜索** — 关键词搜索标题、内容、标签
- **展开/收起** — 点击卡片查看完整内容（基于 `<details>/<summary>`）
- **Markdown 渲染** — 通过 CDN 加载 marked.js 渲染内容
- **暗色/亮色模式** — 跟随系统偏好，支持手动切换
- **响应式设计** — 桌面端和移动端适配
- **URL 状态同步** — 筛选条件反映在 URL hash 中，可分享
- **单条日记页** — 点击标题进入独立页面

## 项目结构

```
mysite/
├── index.html          # 单页面外壳
├── css/
│   └── style.css       # 所有样式
├── js/
│   └── main.js         # 全部应用逻辑（IIFE 模块）
├── data/
│   └── entries.json    # 日记条目数据
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

## 部署到 GitHub Pages

1. 在 GitHub 创建仓库（如 `my-diary`）
2. 将项目文件推送到仓库
3. 进入仓库 Settings → Pages
4. Source 选择 `main` 分支，根目录 `/`，保存
5. 等待几分钟后访问 `https://<你的用户名>.github.io/<仓库名>/`

## 技术栈

- 纯 HTML/CSS/JS，无框架、无构建工具
- [marked.js](https://marked.js.org/) CDN 渲染 Markdown
- CSS 自定义属性实现主题切换
- Hash 路由，无需服务端配置
- IIFE 模块模式，兼容 `file://` 和 GitHub Pages
