// 从 raw_posts.jsonl 构建 data/trades/ 下的索引与详情文件（索引按 id 合并，不覆盖已有记录）
// 用法：node tools/tgb-scrape/build-trades-data.js <raw前缀> <ID> <SOURCE> <楼主昵称> <标题> <描述>
//   例：node tools/tgb-scrape/build-trades-data.js niugu 2014-08-28-qizainiugu-500w \
//         "https://www.tgb.cn/a/1ykz00lu2SS-1?type=Z" 骑在牛股上 "骑在牛股上-五百万实盘&龙头妖股战法" \
//         "骑在牛股上 五百万实盘贴，龙头妖股战法。"
const fs = require('fs');
const path = require('path');

const RAW = path.join(__dirname, (process.argv[2] || 'raw_posts') + '.jsonl');
const OUT_DIR = path.join(__dirname, '..', '..', 'data', 'trades');
const ID = process.argv[3];
const SOURCE = process.argv[4];
const HOST_NAME = process.argv[5];
const TITLE = process.argv[6];
const DESC = process.argv[7] || '';

if (!ID || !SOURCE || !HOST_NAME || !TITLE) {
  console.error('用法: node build-trades-data.js <raw前缀> <ID> <SOURCE> <楼主昵称> <标题> <描述>');
  process.exit(1);
}

const lines = fs.readFileSync(RAW, 'utf8').split('\n').filter(Boolean);
let mainPost = null;
let hostUserid = '';
const posts = [];
const items = [];

for (const line of lines) {
  let item;
  try { item = JSON.parse(line); } catch (e) { console.error('bad line:', line.slice(0, 80)); continue; }
  items.push(item);
  if (item.type === 'main') mainPost = item.data;
}

// 第一遍：按名字找楼主 userid（即使中途改名，userid 不变）
for (const item of items) {
  if (item.type === 'reply' && item.data.name === HOST_NAME) {
    hostUserid = item.data.userid;
    break;
  }
}

// 第二遍：按 userid 过滤全部回帖
for (const item of items) {
  if (item.type !== 'reply') continue;
  const d = item.data;
  if (d.name === HOST_NAME || (hostUserid && d.userid === hostUserid)) {
    posts.push({ time: d.time, content: d.content });
  }
}

// 去重（同一回帖可能被重复抓取）并按时间升序
const seen = new Set();
const unique = posts.filter(p => {
  const k = p.time + '|' + p.content.slice(0, 60);
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});
unique.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));

console.log(`主帖: ${mainPost ? mainPost.time : '缺失'}, 楼主回帖去重后: ${unique.length}`);

const detail = {
  id: ID,
  title: TITLE,
  author: HOST_NAME,
  source: SOURCE,
  mainPost: mainPost ? { time: mainPost.time, content: mainPost.content } : null,
  posts: unique,
};

const firstTime = mainPost ? mainPost.time : (unique[0] ? unique[0].time : '');
const lastTime = unique.length ? unique[unique.length - 1].time : firstTime;

const record = {
  id: ID,
  title: TITLE,
  author: HOST_NAME,
  source: SOURCE,
  startDate: firstTime.slice(0, 10),
  lastPostDate: lastTime.slice(0, 10),
  postCount: unique.length + (mainPost ? 1 : 0),
  desc: DESC +
    (firstTime && lastTime ? `（${firstTime.slice(0, 10)} ~ ${lastTime.slice(0, 10)}，楼主共 ${unique.length + (mainPost ? 1 : 0)} 帖）` : ''),
};

// 合并进现有索引（按 id 覆盖，其余保留）
let index = { records: [] };
const indexFile = path.join(OUT_DIR, 'index.json');
if (fs.existsSync(indexFile)) {
  try { index = JSON.parse(fs.readFileSync(indexFile, 'utf8')); } catch (e) { console.error('索引解析失败，重建:', e.message); }
}
const others = (index.records || []).filter(r => r.id !== ID);
index.records = others.concat([record]);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(indexFile, JSON.stringify(index, null, 2) + '\n');
fs.writeFileSync(path.join(OUT_DIR, ID + '.json'), JSON.stringify(detail, null, 2) + '\n');
console.log('已写入:', indexFile, path.join(OUT_DIR, ID + '.json'));
console.log('详情文件大小:', (fs.statSync(path.join(OUT_DIR, ID + '.json')).size / 1024).toFixed(0), 'KB');
