// 抓取淘股吧帖子全部回帖（移动版页面服务端渲染回帖列表，每页 10 条，末页在首页的"末页"链接中解析）
// 用法：node tools/tgb-scrape/scrape-topic.js <TOPIC_PATH> <楼主昵称> [输出文件前缀]（需先 npm i cheerio）
//   例：node tools/tgb-scrape/scrape-topic.js 1ykz00lu2SS 骑在牛股上 niugu
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const BASE = 'https://m.tgb.cn';
const TOPIC_PATH = process.argv[2] || '1VR3vfnvPms'; // 主题路径 ID（帖子 URL /a/<TOPIC_PATH>-<页码> 中的部分）
const HOST_NAME = process.argv[3] || '水哥割股';     // 楼主昵称，脚本只保留楼主的发言
const OUT_PREFIX = process.argv[4] || 'raw_posts';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
const OUT = path.join(__dirname, OUT_PREFIX + '.jsonl');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchPage(url, retries = 4) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Referer': BASE + '/a/' + TOPIC_PATH },
        redirect: 'follow',
        signal: AbortSignal.timeout(30000),
      });
      if (res.status === 200) return await res.text();
      console.error(`[${res.status}] ${url} (retry ${i + 1})`);
    } catch (e) {
      console.error(`ERR ${url}: ${e.message} (retry ${i + 1})`);
    }
    await sleep(1500 * (i + 1));
  }
  throw new Error('fail: ' + url);
}

function sanitize(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/href\s*=\s*(["'])javascript:[^"']*\1/gi, 'href="#"')
    .replace(/src\s*=\s*(["'])javascript:[^"']*\1/gi, 'src=""');
}

// 将懒加载图片占位替换为真实图片地址
function fixImages(html) {
  return html.replace(/<img([^>]*?)\bsrc="[^"]*placeHolder\.png"[^>]*?\bdata-original="([^"]+)"([^>]*)>/gi, '<img$1 src="$2"$3>');
}

// 解析一页移动版 HTML，返回 { mainPost?, replies:[{time, name, userid, content}] }
function parsePage(html) {
  const $ = cheerio.load(html);
  const out = { replies: [] };

  // 主帖（仅第一页有 tzitem_text）
  const mainText = $('.tzitem_text').first();
  let hostUserid = '';
  const zt = $('#ztgioMsg').first();
  if (zt.length) hostUserid = zt.attr('userid') || '';
  if (mainText.length) {
    const title = $('.Pagetitle h1').first().text().trim();
    const timeText = $('.Pagetime .left').first().text().trim(); // 23-02-06 15:29
    out.mainPost = {
      title,
      author: HOST_NAME,
      time: normalizeTime(timeText),
      content: sanitize(fixImages(mainText.html() || '')).trim(),
    };
  }

  // 回帖
  $('.plItem').each((_, el) => {
    const $el = $(el);
    const gio = $el.find('div[id^="gtgioMsg"]').first();
    const userid = gio.attr('userid') || '';
    const name = gio.attr('username') || $el.find('a.plName').first().text().trim();
    const time = $el.find('.pl_time').first().text().trim();
    const text = $el.find('.pl_text').first();
    const content = sanitize(fixImages(text.html() || '')).trim();
    out.replies.push({ userid, name, time: normalizeTime(time), content });
  });

  out.hostUserid = hostUserid;
  return out;
}

function normalizeTime(t) {
  // "23-02-06 15:29" / "26-07-21 15:03" -> "2023-02-06 15:29"
  if (!t) return '';
  const m = t.match(/^(\d{2})-(\d{2})-(\d{2})\s+(.+)$/);
  if (!m) return t;
  const year = Number(m[1]) < 60 ? 2000 + Number(m[1]) : 1900 + Number(m[1]);
  return `${year}-${m[2]}-${m[3]} ${m[4]}`;
}

async function main() {
  // 首页：解析主帖 + 末页页码（"末页"链接里是最大页码）
  const firstHtml = await fetchPage(`${BASE}/a/${TOPIC_PATH}`);
  const first = parsePage(firstHtml);
  const lastPageMatches = [...firstHtml.matchAll(new RegExp(`/a/${TOPIC_PATH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)\\?type=[^"]*"[^>]*>\\s*末页`, 'g'))];
  const totalPages = lastPageMatches.length ? Math.max(...lastPageMatches.map(m => Number(m[1]))) : 1;
  console.log(`末页: ${totalPages}, 首页回帖: ${first.replies.length}`);
  if (!first.mainPost) throw new Error('未解析到主帖内容');
  const hostUserid = first.hostUserid;

  fs.writeFileSync(OUT, JSON.stringify({ type: 'main', data: first.mainPost }) + '\n');
  let total = first.replies.length;
  first.replies.forEach(r => fs.appendFileSync(OUT, JSON.stringify({ type: 'reply', page: 1, data: r }) + '\n'));

  // 并发抓取 2..totalPages
  const CONCURRENCY = 8;
  let next = 2, active = 0, done = 0, hostCount = 0;
  const results = {};

  const worker = async (pageNo) => {
    let html;
    try {
      html = await fetchPage(`${BASE}/a/${TOPIC_PATH}-${pageNo}?type=new`);
    } catch (e) {
      results[pageNo] = { err: e.message };
      return;
    }
    let parsed;
    try { parsed = parsePage(html); } catch (e) { results[pageNo] = { err: 'parse:' + e.message }; return; }
    results[pageNo] = parsed;
  };

  await new Promise((resolve) => {
    const pump = () => {
      while (active < CONCURRENCY && next <= totalPages) {
        const pageNo = next++;
        active++;
        worker(pageNo).then(() => {
          active--;
          const r = results[pageNo];
          if (r && !r.err) {
            total += r.replies.length;
            r.replies.forEach(reply => {
              if (reply.name === HOST_NAME || reply.userid === hostUserid) hostCount++;
              fs.appendFileSync(OUT, JSON.stringify({ type: 'reply', page: pageNo, data: reply }) + '\n');
            });
          }
          done++;
          if (done % 200 === 0) console.log(`进度: ${done}/${totalPages} (楼主帖 ${hostCount})`);
          pump();
          if (done >= totalPages - 1) resolve();
        });
      }
    };
    pump();
  });

  // 检查失败页
  const failed = Object.entries(results).filter(([, v]) => v && v.err);
  console.log(`完成。总回帖 ${total} 条，其中楼主 ${hostCount} 条；失败页: ${failed.length}`);
  if (failed.length) console.log(failed.slice(0, 20).map(([p, v]) => `p${p}: ${v.err}`).join('\n'));
  fs.writeFileSync(path.join(__dirname, OUT_PREFIX + '_main.json'), JSON.stringify(first.mainPost, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
