(function () {
  "use strict";

  // ===== 常量 =====
  var INDEX_URL = "data/trades/index.json";
  var PAGE_SIZE = 50; // 详情页每次渲染的帖子数

  // ===== DOM 引用 =====
  var $loading = document.getElementById("loading");
  var $error = document.getElementById("error");
  var $listView = document.getElementById("list-view");
  var $detailView = document.getElementById("detail-view");
  var $tradeList = document.getElementById("trade-list");
  var $detailBody = document.getElementById("detail-body");
  var $themeToggle = document.getElementById("theme-toggle");

  // ===== 状态 =====
  var indexRecords = [];  // 列表元数据
  var current = null;     // 当前详情数据
  var shownCount = 0;     // 已渲染的帖子数
  var loaded = false;     // index 是否已加载
  var filter = { month: "", start: "", end: "" }; // 月份/时间范围筛选

  // ===== 主题 =====
  function initTheme() {
    var saved = localStorage.getItem("theme");
    if (saved === "dark") {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    } else if (saved === "light") {
      document.documentElement.classList.add("light");
      document.documentElement.classList.remove("dark");
    }
  }

  function toggleTheme() {
    if (document.documentElement.classList.contains("dark")) {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
      localStorage.setItem("theme", "light");
    } else {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
      localStorage.setItem("theme", "dark");
    }
  }

  // ===== 工具 =====
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtDate(t) {
    // "2023-02-06 15:29" -> "2023-02-06"
    return String(t || "").slice(0, 10);
  }

  function monthOf(t) {
    return String(t || "").slice(0, 7);
  }

  // ===== 数据加载 =====
  function loadIndex() {
    $loading.style.display = "block";
    $error.style.display = "none";

    // ?t= 时间戳绕过浏览器启发式缓存
    fetch(INDEX_URL + "?t=" + Date.now())
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (json) {
        indexRecords = (json.records || [])
          .filter(function (r) { return r && r.id; })
          .map(function (r) {
            return {
              id: String(r.id),
              title: String(r.title || ""),
              author: String(r.author || ""),
              source: String(r.source || ""),
              startDate: String(r.startDate || ""),
              lastPostDate: String(r.lastPostDate || ""),
              postCount: parseInt(r.postCount, 10) || 0,
              desc: String(r.desc || "")
            };
          });
        loaded = true;
        $loading.style.display = "none";
        route();
      })
      .catch(function (err) {
        console.error("加载实盘记录列表失败:", err);
        $loading.style.display = "none";
        $error.style.display = "block";
      });
  }

  function loadDetail(id) {
    $loading.style.display = "block";
    $error.style.display = "none";
    $listView.style.display = "none";
    $detailView.style.display = "none";

    fetch("data/trades/" + encodeURIComponent(id) + ".json?t=" + Date.now())
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (json) {
        current = json;
        $loading.style.display = "none";
        renderDetail();
      })
      .catch(function (err) {
        console.error("加载详情失败:", err);
        $loading.style.display = "none";
        $error.style.display = "block";
        var p = document.createElement("p");
        p.textContent = "未找到该实盘记录（" + id + "），请返回列表重试。";
        $error.appendChild(p);
      });
  }

  // ===== 列表渲染 =====
  function renderList() {
    $loading.style.display = "none";
    $error.style.display = "none";
    $detailView.style.display = "none";
    $listView.style.display = "block";

    if (!indexRecords.length) {
      $tradeList.innerHTML = '<div class="no-results"><p>暂无实盘记录</p></div>';
      return;
    }

    var html = indexRecords.map(function (r) {
      var meta = [];
      meta.push('<span class="trade-author">' + esc(r.author) + "</span>");
      if (r.startDate) meta.push("<span>首发 " + esc(r.startDate) + "</span>");
      if (r.lastPostDate) meta.push("<span>最新 " + esc(r.lastPostDate) + "</span>");
      if (r.postCount) meta.push("<span>" + r.postCount + " 帖</span>");

      var card =
        '<a class="trade-card" href="#/trade/' + encodeURIComponent(r.id) + '">' +
        '<div class="trade-card-title">' + esc(r.title) + "</div>" +
        '<div class="trade-card-meta">' + meta.join("") + "</div>" +
        (r.desc ? '<div class="trade-card-desc">' + esc(r.desc) + "</div>" : "") +
        "</a>";
      return card;
    }).join("");

    $tradeList.innerHTML = html;
  }

  // ===== 详情渲染 =====
  function renderDetail() {
    var posts = current.posts || [];
    shownCount = 0;
    filter = { month: "", start: "", end: "" };
    current.sorted = posts.slice().sort(function (a, b) {
      if (a.time < b.time) return -1;
      if (a.time > b.time) return 1;
      return 0;
    });

    $loading.style.display = "none";
    $error.style.display = "none";
    $listView.style.display = "none";
    $detailView.style.display = "block";

    var first = current.mainPost ? current.mainPost.time : (posts[0] ? posts[0].time : "");
    var last = current.sorted.length ? current.sorted[current.sorted.length - 1].time : first;

    // 月份选项（按回帖统计；主帖固定置顶展示，不参与筛选）
    var monthCounts = {};
    current.sorted.forEach(function (p) {
      var m = monthOf(p.time);
      if (m) monthCounts[m] = (monthCounts[m] || 0) + 1;
    });
    var monthOptions = '<option value="">全部月份</option>' +
      Object.keys(monthCounts).sort().map(function (m) {
        return '<option value="' + esc(m) + '">' + esc(m.slice(0, 4) + " 年 " + m.slice(5) + " 月（" + monthCounts[m] + "）") + "</option>";
      }).join("");

    $detailBody.innerHTML =
      '<div class="trade-detail-head">' +
      '<h2 class="trade-detail-title">' + esc(current.title) + "</h2>" +
      '<div class="trade-detail-meta">' +
      '<span class="trade-author">' + esc(current.author) + "</span>" +
      (first ? "<span>首发 " + esc(fmtDate(first)) + "</span>" : "") +
      (last ? "<span>最新 " + esc(fmtDate(last)) + "</span>" : "") +
      '<span id="stat-posts">楼主发帖 ' + (current.sorted.length + 1) + " 条</span>" +
      (current.source ? '<a class="source-link" href="' + esc(current.source) + '" target="_blank" rel="noopener">原文 ↗</a>' : "") +
      "</div></div>" +
      '<div class="trade-filters" aria-label="筛选条件">' +
      '<label class="filter-label">月份 <select id="filter-month" class="filter-select">' + monthOptions + "</select></label>" +
      '<label class="filter-label">从 <input type="date" id="filter-start" class="filter-date" min="' + esc(fmtDate(first)) + '" max="' + esc(fmtDate(last)) + '"></label>' +
      '<label class="filter-label">到 <input type="date" id="filter-end" class="filter-date" min="' + esc(fmtDate(first)) + '" max="' + esc(fmtDate(last)) + '"></label>' +
      '<button id="filter-clear" class="filter-clear">清除筛选</button>' +
      "</div>" +
      '<div id="trade-posts" class="trade-posts"></div>' +
      '<div class="load-more-wrap"><button id="load-more" class="load-more-btn" style="display:none;">加载更多</button></div>' +
      '<div id="feed-end" class="feed-end" style="display:none;">— 已到尽头 —</div>';

    applyFilter();
  }

  function markMain(mainPost) {
    return {
      time: mainPost.time,
      content: mainPost.content,
      isMain: true
    };
  }

  function filterActive() {
    return !!(filter.month || filter.start || filter.end);
  }

  function applyFilter() {
    current.filtered = current.sorted.filter(function (p) {
      if (filter.month && monthOf(p.time) !== filter.month) return false;
      var d = fmtDate(p.time);
      if (filter.start && d < filter.start) return false;
      if (filter.end && d > filter.end) return false;
      return true;
    });
    renderFeed();
  }

  function clearFilters() {
    filter = { month: "", start: "", end: "" };
    var $month = document.getElementById("filter-month");
    var $start = document.getElementById("filter-start");
    var $end = document.getElementById("filter-end");
    if ($month) $month.value = "";
    if ($start) $start.value = "";
    if ($end) $end.value = "";
    applyFilter();
  }

  // 重建帖子流：主帖置顶 + 筛选后的回帖
  function renderFeed() {
    var active = filterActive();
    current.feed = [].concat(
      current.mainPost ? [markMain(current.mainPost)] : [],
      active ? current.filtered : current.sorted
    );
    shownCount = 0;

    var stat = document.getElementById("stat-posts");
    if (stat) {
      stat.textContent = active
        ? "筛选出 " + current.filtered.length + " / 共 " + current.sorted.length + " 帖"
        : "楼主发帖 " + (current.sorted.length + 1) + " 条";
    }

    var container = document.getElementById("trade-posts");
    if (container) {
      container.innerHTML = "";
      if (active && !current.filtered.length) {
        container.innerHTML = '<div class="no-results"><p>没有符合筛选条件的帖子</p></div>';
      }
    }
    var end = document.getElementById("feed-end");
    if (end) end.style.display = "none";

    appendPosts();
  }

  function appendPosts() {
    var container = document.getElementById("trade-posts");
    if (!container) return;
    var feed = current.feed || [];
    var batch = feed.slice(shownCount, shownCount + PAGE_SIZE);
    if (!batch.length) {
      document.getElementById("load-more").style.display = "none";
      document.getElementById("feed-end").style.display = "block";
      return;
    }

    var prevMonth = "";
    var html = "";
    batch.forEach(function (p) {
      var m = monthOf(p.time);
      if (m && m !== prevMonth) {
        html += '<div class="month-divider">' + esc(m.replace("-", " 年 ") + " 月") + "</div>";
        prevMonth = m;
      }
      html +=
        '<article class="post-card' + (p.isMain ? " main-post" : "") + '">' +
        '<div class="post-card-time">' + esc(p.time || "") +
        (p.isMain ? '<span class="post-badge">主帖</span>' : "") +
        "</div>" +
        '<div class="post-content">' + (p.content || "") + "</div>" +
        "</article>";
    });
    container.insertAdjacentHTML("beforeend", html);
    shownCount += batch.length;

    var btn = document.getElementById("load-more");
    if (shownCount < feed.length) {
      btn.style.display = "inline-block";
      btn.textContent = "加载更多（已显示 " + shownCount + " / " + feed.length + "）";
      btn.disabled = false;
    } else {
      btn.style.display = "none";
      document.getElementById("feed-end").style.display = "block";
    }
  }

  // ===== 路由 =====
  function route() {
    if (!loaded) return;
    var hash = window.location.hash || "#/";
    var m = hash.match(/^#\/trade\/(.+)$/);
    if (m) {
      loadDetail(decodeURIComponent(m[1]));
    } else {
      renderList();
    }
  }

  // ===== 事件 =====
  $themeToggle.addEventListener("click", toggleTheme);

  window.addEventListener("hashchange", function () {
    // 清理上一次详情的报错附加信息
    $error.innerHTML =
      '<p>加载实盘记录数据失败。</p>' +
      "<p>如果你在本地查看此页面，请尝试使用本地服务器：</p>" +
      "<code>python3 -m http.server 9898</code>";
    route();
  });

  // 筛选事件（$detailBody 是固定容器，事件委托，innerHTML 重建后依然有效）
  $detailBody.addEventListener("change", function (e) {
    var t = e.target;
    if (t.id === "filter-month") {
      filter.month = t.value;
      applyFilter();
    } else if (t.id === "filter-start") {
      filter.start = t.value;
      applyFilter();
    } else if (t.id === "filter-end") {
      filter.end = t.value;
      applyFilter();
    }
  });

  $detailBody.addEventListener("click", function (e) {
    if (e.target && e.target.id === "filter-clear") {
      clearFilters();
    }
  });

  document.addEventListener("click", function (e) {
    var target = e.target;
    // 加载更多
    if (target && target.id === "load-more") {
      appendPosts();
      return;
    }
    // 内容图片（缩略图）Lightbox；表情小图不放大
    var img = target.closest ? target.closest('.post-content img[src*="image.tgb.cn"]') : null;
    if (img) {
      openLightbox(img);
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      var overlay = document.querySelector(".lightbox-overlay");
      if (overlay) document.body.removeChild(overlay);
    }
  });

  function openLightbox(img) {
    var overlay = document.createElement("div");
    overlay.className = "lightbox-overlay";
    var cloned = document.createElement("img");
    // 优先加载高清大图（_max），失败回退到缩略图原地址
    var hires = img.src.replace(/_760w\.png$/i, "_max.png");
    cloned.src = hires === img.src ? img.src : hires;
    if (hires !== img.src) {
      cloned.onerror = function () { cloned.src = img.src; };
    }
    cloned.alt = img.alt || "";
    overlay.appendChild(cloned);
    overlay.addEventListener("click", function () {
      document.body.removeChild(overlay);
    });
    document.body.appendChild(overlay);
  }

  // ===== 启动 =====
  initTheme();
  loadIndex();
})();
