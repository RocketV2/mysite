# 淘股吧实盘贴抓取工具

用于生成 `data/trades/` 下的实盘记录数据文件（每个详情页一个 JSON）。

## 抓取原理

- 淘股吧桌面版回帖列表由登录后 XHR 加载，匿名无法访问；
- 移动版 `https://m.tgb.cn/a/<TOPIC_PATH>` 的回帖是服务端渲染的（每页 10 条，`div.plItem`），匿名可见；
- 匿名仅能看到前 ~3300 页（约 3.3 万条回帖），更深页面服务端不返回内容——通常是已删除/隐藏的回帖，不影响「楼主发言」的完整性（以最早可见回帖时间是否为帖子发布时间来校验）。

## 用法

```bash
npm i cheerio   # 首次
# 1) 编辑 scrape-topic.js 顶部的 TOPIC_PATH（帖子 URL /a/xxx 部分）与 HOST_NAME（楼主昵称）
node scrape-topic.js        # 输出 raw_posts.jsonl（主帖 + 全部回帖，含非楼主）与 raw_main.json
# 2) 编辑 build-trades-data.js 顶部的 ID / SOURCE / HOST_NAME / 标题与描述
node build-trades-data.js   # 生成 data/trades/index.json 与 data/trades/<id>.json
```

## 数据格式

- `data/trades/index.json`：`{records: [{id, title, author, source, startDate, lastPostDate, postCount, desc}]}`（列表页元数据）
- `data/trades/<id>.json`：`{id, title, author, source, mainPost: {time, content}, posts: [{time, content}]}`，`posts` 按时间升序，仅楼主发言
- `content` 为经过消毒的 HTML（剥离 script/iframe/on* 事件，懒加载图片已替换为真实地址）
