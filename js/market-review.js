(function () {
  "use strict";

  // ===== 常量 =====
  var PHASES = ["冰点", "回暖", "高潮", "分歧", "退潮"];
  var PHASE_COLORS = {
    "冰点": "freeze",
    "回暖": "warm",
    "高潮": "hot",
    "分歧": "neutral",
    "退潮": "cold"
  };
  var PHASE_SCORES = {
    "冰点": 1,
    "回暖": 4,
    "高潮": 8,
    "分歧": 5,
    "退潮": 2
  };

  var SENTIMENT_LABELS = {
    "热": { cls: "badge-hot", text: "🔥 热" },
    "温": { cls: "badge-warm", text: "🌤 温" },
    "冷": { cls: "badge-cold", text: "❄️ 冷" },
    "冰": { cls: "badge-freeze", text: "🧊 冰" },
    "中性": { cls: "badge-neutral", text: "➖ 中性" }
  };

  var ACTION_LABELS = {
    "买入": { cls: "action-buy", text: "买入" },
    "卖出": { cls: "action-sell", text: "卖出" },
    "持有": { cls: "action-hold", text: "持有" },
    "减仓": { cls: "action-sell", text: "减仓" },
    "加仓": { cls: "action-buy", text: "加仓" },
    "观察": { cls: "action-watch", text: "观察" }
  };

  var ROLE_LABELS = {
    "龙头": "role-leader",
    "中军": "role-core",
    "跟风": "role-follower"
  };

  // ===== 状态 =====
  var records = [];
  var currentDate = "";
  var currentIndex = -1;

  // ===== DOM 引用 =====
  var $loading = document.getElementById("loading");
  var $error = document.getElementById("error");
  var $reviewContainer = document.getElementById("review-container");
  var $noData = document.getElementById("no-data");
  var $datePicker = document.getElementById("date-picker");
  var $navPrev = document.getElementById("nav-prev");
  var $navNext = document.getElementById("nav-next");
  var $navLatest = document.getElementById("nav-latest");
  var $themeToggle = document.getElementById("theme-toggle");

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

  // ===== 数据加载 =====
  function loadData() {
    $loading.style.display = "block";
    $error.style.display = "none";
    $reviewContainer.style.display = "none";
    $noData.style.display = "none";

    fetch("data/market-review.json")
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (data) {
        records = (data.records || []).slice();
        // 按日期倒序排列
        records.sort(function (a, b) {
          if (a.date > b.date) return -1;
          if (a.date < b.date) return 1;
          return 0;
        });

        if (records.length > 0) {
          // 默认显示第一条（最新）
          showRecord(0);
        } else {
          $loading.style.display = "none";
          $noData.style.display = "block";
        }

        // 设置 date picker 的范围
        if (records.length > 0) {
          $datePicker.min = records[records.length - 1].date;
          $datePicker.max = records[0].date;
        }
      })
      .catch(function (err) {
        console.error("加载复盘数据失败:", err);
        $loading.style.display = "none";
        $error.style.display = "block";
      });
  }

  // ===== 记录导航 =====
  function showRecord(index) {
    if (index < 0 || index >= records.length) return;

    currentIndex = index;
    currentDate = records[index].date;
    $datePicker.value = currentDate;
    renderReview(records[index]);
    updateNavButtons();
  }

  function showDate(dateStr) {
    for (var i = 0; i < records.length; i++) {
      if (records[i].date === dateStr) {
        showRecord(i);
        return;
      }
    }
    // 没有该日期的数据
    $loading.style.display = "none";
    $error.style.display = "none";
    $reviewContainer.style.display = "none";
    $noData.style.display = "block";
    currentDate = dateStr;
    currentIndex = -1;
    updateNavButtons();
  }

  function goPrev() {
    if (currentIndex < records.length - 1) {
      showRecord(currentIndex + 1);
    }
  }

  function goNext() {
    if (currentIndex > 0) {
      showRecord(currentIndex - 1);
    }
  }

  function goLatest() {
    if (records.length > 0) {
      showRecord(0);
    }
  }

  function updateNavButtons() {
    $navPrev.disabled = currentIndex >= records.length - 1;
    $navNext.disabled = currentIndex <= 0;
  }

  // ===== 渲染 =====
  function renderReview(record) {
    $loading.style.display = "none";
    $error.style.display = "none";
    $noData.style.display = "none";
    $reviewContainer.style.display = "block";

    var html = "";
    html += renderSentimentDashboard(record);
    html += renderThemesSection(record);
    html += renderStocksSection(record);
    html += renderBottomSection(record);

    $reviewContainer.innerHTML = html;
  }

  // ===== 情绪仪表盘 =====
  function renderSentimentDashboard(record) {
    var s = record.sentiment;
    var phaseIdx = PHASES.indexOf(s.phase);
    var colorKey = PHASE_COLORS[s.phase] || "neutral";
    var progressPct = ((phaseIdx + 1) / PHASES.length) * 100;

    // 周期环 SVG 参数
    var radius = 60;
    var circumference = 2 * Math.PI * radius;
    var offset = circumference - (progressPct / 100) * circumference;

    // 仓位建议颜色
    var posColor = "";
    if (s.positionAdvice >= 7) posColor = "var(--mr-phase-hot)";
    else if (s.positionAdvice >= 4) posColor = "var(--mr-phase-warm)";
    else posColor = "var(--mr-phase-cold)";

    // 量能标签
    var volumeCls = "";
    if (s.volume === "放量") volumeCls = "volume-up";
    else if (s.volume === "缩量") volumeCls = "volume-down";
    else volumeCls = "volume-flat";

    // 评分圆点颜色
    var dotColor = "";
    if (s.score >= 7) dotColor = "hot";
    else if (s.score >= 4) dotColor = "warm";
    else dotColor = "cold";

    var scoreDots = "";
    for (var i = 1; i <= 10; i++) {
      var active = i <= s.score ? " active " + dotColor : "";
      scoreDots += '<span class="score-dot' + active + '"></span>';
    }

    // 阶段条
    var phaseSteps = "";
    PHASES.forEach(function (p, idx) {
      var stepCls = "phase-step-" + PHASE_COLORS[p];
      var inactive = idx !== phaseIdx ? " inactive" : "";
      var label = "";
      switch (p) {
        case "冰点": label = "冰"; break;
        case "回暖": label = "暖"; break;
        case "高潮": label = "高"; break;
        case "分歧": label = "分"; break;
        case "退潮": label = "退"; break;
      }
      phaseSteps += '<span class="phase-step ' + stepCls + inactive + '">' + label + '</span>';
    });

    var html = "";
    html += '<div class="sentiment-dashboard">';
    html += '<div class="section-label">📊 市场情绪</div>';
    html += '<div class="sentiment-main">';

    // 左侧：周期环
    html += '<div class="phase-ring-container">';
    html += '<div class="phase-ring">';
    html += '<svg width="140" height="140" viewBox="0 0 140 140">';
    html += '<circle class="ring-bg" cx="70" cy="70" r="' + radius + '"/>';
    html += '<circle class="ring-fill stroke-' + colorKey + '" cx="70" cy="70" r="' + radius + '"';
    html += ' stroke-dasharray="' + circumference + '" stroke-dashoffset="' + offset + '"/>';
    html += '</svg>';
    html += '<div class="phase-label">';
    html += '<span class="phase-name phase-color-' + colorKey + '">' + esc(s.phase) + '</span>';
    html += '<span class="phase-sub">强度 ' + s.score + '/10</span>';
    html += '</div>';
    html += '</div>';
    html += '<div class="phase-bar">' + phaseSteps + '</div>';
    html += '</div>';

    // 右侧：指标
    html += '<div class="sentiment-metrics">';

    // 评分
    html += '<div class="metric-row">';
    html += '<span class="metric-label">市场强度</span>';
    html += '<div class="score-bar">' + scoreDots + '</div>';
    html += '<span class="metric-value phase-color-' + colorKey + '">' + s.score + '/10</span>';
    html += '</div>';

    // 量能
    html += '<div class="metric-row">';
    html += '<span class="metric-label">量能</span>';
    html += '<span class="volume-tag ' + volumeCls + '">' + esc(s.volume) + '</span>';
    if (s.volumeDetail) {
      html += '<span class="metric-value" style="font-size:0.85rem;color:var(--color-text-secondary);">' + esc(s.volumeDetail) + '</span>';
    }
    html += '</div>';

    // 仓位建议
    html += '<div class="metric-row">';
    html += '<span class="metric-label">建议仓位</span>';
    html += '<div class="position-advice">';
    html += '<div class="position-bar-bg">';
    html += '<div class="position-bar-fill" style="width:' + (s.positionAdvice * 10) + '%;background:' + posColor + ';"></div>';
    html += '</div>';
    html += '<span class="position-pct" style="color:' + posColor + ';">' + s.positionAdvice + '成</span>';
    html += '</div>';
    html += '</div>';

    html += '</div>'; // sentiment-metrics
    html += '</div>'; // sentiment-main

    // 情绪备注
    if (s.note) {
      html += '<div class="sentiment-note">' + esc(s.note) + '</div>';
    }

    html += '</div>'; // sentiment-dashboard
    return html;
  }

  // ===== 题材面板 =====
  function renderThemesSection(record) {
    if (!record.themes || record.themes.length === 0) return "";

    var html = "";
    html += '<div class="themes-section">';
    html += '<div class="section-header">';
    html += '<span class="section-icon">🎯</span>';
    html += '<span class="section-title">题材跟踪</span>';
    html += '</div>';
    html += '<div class="themes-grid">';

    record.themes.forEach(function (theme) {
      html += renderThemeCard(theme);
    });

    html += '</div>';
    html += '</div>';
    return html;
  }

  function renderThemeCard(theme) {
    var sentInfo = SENTIMENT_LABELS[theme.sentiment] || SENTIMENT_LABELS["中性"];
    var phaseCls = PHASE_COLORS[theme.phase] || "neutral";
    var strengthPct = theme.strength * 10;

    // 强度圆点颜色
    var dotColor = "";
    if (theme.strength >= 7) dotColor = "hot";
    else if (theme.strength >= 4) dotColor = "warm";
    else dotColor = "cold";

    var strengthDots = "";
    for (var i = 1; i <= 10; i++) {
      var filled = i <= theme.strength ? " filled " + dotColor : "";
      strengthDots += '<span class="strength-dot' + filled + '"></span>';
    }

    var stocksHtml = "";
    if (theme.leadingStocks && theme.leadingStocks.length > 0) {
      theme.leadingStocks.forEach(function (s) {
        stocksHtml += '<span class="theme-stock-tag">' + esc(s) + '</span>';
      });
    }

    var html = "";
    html += '<div class="theme-card">';
    html += '<div class="theme-card-header">';
    html += '<span class="theme-name">' + esc(theme.name) + '</span>';
    html += '<span class="theme-phase-badge badge-' + phaseCls + '">' + esc(theme.phase) + '</span>';
    html += '</div>';
    html += '<div class="theme-meta">';
    html += '<span class="' + sentInfo.cls + ' theme-phase-badge" style="font-size:0.75rem;">' + sentInfo.text + '</span>';
    html += '<div class="theme-strength">';
    html += '<span style="font-size:0.78rem;color:var(--color-text-secondary);">强度</span>';
    html += '<div class="strength-dots">' + strengthDots + '</div>';
    html += '<span style="font-size:0.78rem;font-weight:600;">' + theme.strength + '/10</span>';
    html += '</div>';
    html += '</div>';
    if (theme.note) {
      html += '<div class="theme-note">' + esc(theme.note) + '</div>';
    }
    if (stocksHtml) {
      html += '<div class="theme-stocks">' + stocksHtml + '</div>';
    }
    html += '</div>';
    return html;
  }

  // ===== 核心股面板 =====
  function renderStocksSection(record) {
    if (!record.coreStocks || record.coreStocks.length === 0) return "";

    var html = "";
    html += '<div class="stocks-section">';
    html += '<div class="section-header">';
    html += '<span class="section-icon">💎</span>';
    html += '<span class="section-title">核心股跟踪</span>';
    html += '</div>';
    html += '<div class="stocks-table-wrap">';
    html += '<table class="stocks-table">';
    html += '<thead><tr>';
    html += '<th>股票</th>';
    html += '<th>所属题材</th>';
    html += '<th>定位</th>';
    html += '<th>操作</th>';
    html += '<th>仓位</th>';
    html += '<th>理由</th>';
    html += '</tr></thead>';
    html += '<tbody>';

    record.coreStocks.forEach(function (stock) {
      html += renderStockRow(stock);
    });

    html += '</tbody>';
    html += '</table>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  function renderStockRow(stock) {
    var actionInfo = ACTION_LABELS[stock.action] || { cls: "action-watch", text: stock.action };
    var roleCls = ROLE_LABELS[stock.role] || "role-follower";
    var ratioText = stock.ratio > 0 ? (stock.ratio * 10).toFixed(0) + "成" : "—";

    var html = "";
    html += '<tr>';
    html += '<td><span class="stock-name">' + esc(stock.stock) + '</span></td>';
    html += '<td><span class="stock-theme">' + esc(stock.theme) + '</span></td>';
    html += '<td><span class="stock-role ' + roleCls + '">' + esc(stock.role) + '</span></td>';
    html += '<td><span class="stock-action ' + actionInfo.cls + '">' + actionInfo.text + '</span></td>';
    html += '<td><span class="stock-ratio">' + ratioText + '</span></td>';
    html += '<td><span class="stock-reason">' + esc(stock.reason) + '</span></td>';
    html += '</tr>';
    return html;
  }

  // ===== 总结和计划 =====
  function renderBottomSection(record) {
    if (!record.summary && !record.plan) return "";

    var html = "";
    html += '<div class="bottom-section">';

    if (record.summary) {
      html += '<div class="summary-card">';
      html += '<div class="card-title">📝 当日总结</div>';
      html += '<div class="card-content">' + esc(record.summary) + '</div>';
      html += '</div>';
    }

    if (record.plan) {
      html += '<div class="plan-card">';
      html += '<div class="card-title">📋 次日计划</div>';
      html += '<div class="card-content">' + esc(record.plan) + '</div>';
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  // ===== 工具函数 =====
  function esc(str) {
    if (!str) return "";
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ===== 事件绑定 =====
  $themeToggle.addEventListener("click", toggleTheme);

  $datePicker.addEventListener("change", function () {
    var val = $datePicker.value;
    if (val) showDate(val);
  });

  $navPrev.addEventListener("click", goPrev);
  $navNext.addEventListener("click", goNext);
  $navLatest.addEventListener("click", goLatest);

  // ===== 启动 =====
  initTheme();
  loadData();
})();
