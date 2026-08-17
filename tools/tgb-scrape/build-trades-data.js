// 从 raw_posts.jsonl 构建 data/trades/ 下的索引与详情文件
const fs = require('fs');

const RAW = require('path').join(__dirname, 'raw_posts.jsonl');
const OUT_DIR = require('path').join(__dirname, '..', '..', 'data', 'trades');
const ID = '2023-02-06-shuige-100w';
const SOURCE = 'https://www.tgb.cn/a/1VR3vfnvPms-75?type=Z';
const HOST_NAME = '水哥割股';

const lines = fs.readFileSync(RAW, 'utf8').split('\n').filter(Boolean);
let mainPost = null;
const posts = [];

for (const line of lines) {
  let item;
  try { item = JSON.parse(line); } catch (e) { console.error('bad line:', line.slice(0, 80)); continue; }
  if (item.type === 'main') {
    mainPost = item.data;
  } else if (item.type === 'reply') {
    const d = item.data;
    if (d.name === HOST_NAME || d.userid === '8287898') {
      posts.push({ time: d.time, content: d.content });
    }
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
  title: '2023年100w实盘开启，梦的起点',
  author: HOST_NAME,
  source: SOURCE,
  mainPost: mainPost ? { time: mainPost.time, content: mainPost.content } : null,
  posts: unique,
};

const firstTime = mainPost ? mainPost.time : (unique[0] ? unique[0].time : '');
const lastTime = unique.length ? unique[unique.length - 1].time : firstTime;

const index = {
  records: [
    {
      id: ID,
      title: detail.title,
      author: HOST_NAME,
      source: SOURCE,
      startDate: firstTime.slice(0, 10),
      lastPostDate: lastTime.slice(0, 10),
      postCount: unique.length + (mainPost ? 1 : 0),
      desc: '水哥割股 2023年100w实盘贴，记录交易思路与心态成长。' +
        (firstTime && lastTime ? `（${firstTime.slice(0, 10)} ~ ${lastTime.slice(0, 10)}，楼主共 ${unique.length + (mainPost ? 1 : 0)} 帖）` : ''),
    },
  ],
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(`${OUT_DIR}/index.json`, JSON.stringify(index, null, 2) + '\n');
fs.writeFileSync(`${OUT_DIR}/${ID}.json`, JSON.stringify(detail, null, 2) + '\n');
console.log('已写入:', `${OUT_DIR}/index.json`, `${OUT_DIR}/${ID}.json`);
console.log('详情文件大小:', (fs.statSync(`${OUT_DIR}/${ID}.json`).size / 1024).toFixed(0), 'KB');
