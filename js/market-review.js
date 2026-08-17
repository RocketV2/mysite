(function () {
  "use strict";

  // ===== 常量 =====
  var MAX_FILL_LEVEL = 7; // 7板及以上共用最高档色阶
  var WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

  // ===== DOM 引用 =====
  var $loading = document.getElementById("loading");
  var $error = document.getElementById("error");
  var $dashboard = document.getElementById("dashboard");
  var $noData = document.getElementById("no-data");
  var $navPrev = document.getElementById("nav-prev");
  var $navNext = document.getElementById("nav-next");
  var $navLatest = document.getElementById("nav-latest");
  var $navDate = document.getElementById("nav-date");
  var $date = document.getElementById("mr-date");
  var $statTiles = document.getElementById("stat-tiles");
  var $note = document.getElementById("mr-note");
  var $trend = document.getElementById("board-trend");
  var $table = document.getElementById("ladder-table");
  var $search = document.getElementById("mr-search");
  var $onlyLianban = document.getElementById("mr-only-lianban");
  var $tooltip = document.getElementById("chip-tooltip");
  var $themeToggle = document.getElementById("theme-toggle");

  // ===== 状态 =====
  var records = [];       // [{ date, note, stocks }] 按日期倒序
  var currentIndex = -1;  // 当前展示的 record 索引（-1 = 无）
  var current = null;     // 当前展示的 record
  var themes = [];        // [{ name, stocks, maxBoard, count }] 按强度排序
  var levels = [];        // [1..maxBoard]
  var maxBoard = 1;
  var searchTerm = "";
  var focusCol = 0;       // 聚焦的板数列（0 = 无）
  var focusTheme = "";    // 聚焦的题材（"" = 无）
  var trendChart = null;  // ECharts 实例

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
    // 图表颜色跟随主题变量重新渲染
    if (trendChart) renderTrendChart();
  }

  // ===== 数据加载 =====
  function loadData() {
    $loading.style.display = "block";
    $error.style.display = "none";
    $dashboard.style.display = "none";
    $noData.style.display = "none";

    // ?t= 时间戳绕过浏览器启发式缓存（数据文件手动编辑，需要每次拉最新）
    fetch("data/market-review.json?t=" + Date.now())
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (json) {
        records = normalize(json);
        if (records.length === 0) {
          $loading.style.display = "none";
          $noData.style.display = "block";
          return;
        }
        // 日期选择器范围：最旧 ~ 最新交易日
        $navDate.min = records[records.length - 1].date;
        $navDate.max = records[0].date;
        showRecord(0); // 默认最新交易日
      })
      .catch(function (err) {
        console.error("加载复盘数据失败:", err);
        $loading.style.display = "none";
        $error.style.display = "block";
      });
  }

  function normalize(json) {
    return (json.records || [])
      .filter(function (r) { return r && r.date && r.stocks; })
      .map(function (r) {
        return {
          date: String(r.date),
          note: String(r.note || ""),
          stocks: (r.stocks || [])
            .filter(function (s) { return s && s.name && s.theme; })
            .map(function (s) {
              var boards = parseInt(s.boards, 10);
              return {
                code: String(s.code || "—"),
                name: String(s.name),
                theme: String(s.theme),
                boards: boards >= 1 ? boards : 1
              };
            })
        };
      })
      .filter(function (r) { return r.stocks.length > 0; })
      .sort(function (a, b) {
        if (a.date < b.date) return 1;
        if (a.date > b.date) return -1;
        return 0;
      });
  }

  // ===== 交易日导航 =====
  function showRecord(index) {
    if (index < 0 || index >= records.length) return;
    currentIndex = index;
    current = records[index];
    $navDate.value = current.date;
    focusCol = 0;
    focusTheme = "";
    hideTooltip();
    derive(current);
    renderAll();
    updateNavButtons();
    $loading.style.display = "none";
    $error.style.display = "none";
    $noData.style.display = "none";
    $dashboard.style.display = "block";
    // 趋势图在容器可见后初始化；已存在则只移动“当前日”标记线（保留缩放状态）
    if (!trendChart) {
      renderTrendChart();
    } else {
      updateTrendMarkline();
    }
  }

  function showDate(dateStr) {
    for (var i = 0; i < records.length; i++) {
      if (records[i].date === dateStr) {
        showRecord(i);
        return;
      }
    }
    // 该日期没有复盘数据
    currentIndex = -1;
    current = null;
    $navDate.value = dateStr;
    $loading.style.display = "none";
    $error.style.display = "none";
    $dashboard.style.display = "none";
    $noData.style.display = "block";
    updateNavButtons();
    updateTrendMarkline();
  }

  function goPrev() {
    if (currentIndex >= 0 && currentIndex < records.length - 1) {
      showRecord(currentIndex + 1);
    }
  }

  function goNext() {
    if (currentIndex > 0) {
      showRecord(currentIndex - 1);
    }
  }

  function goLatest() {
    if (records.length > 0) showRecord(0);
  }

  function updateNavButtons() {
    var none = currentIndex === -1;
    $navPrev.disabled = none || currentIndex >= records.length - 1;
    $navNext.disabled = none || currentIndex <= 0;
  }

  // 派生：板层列表 + 按题材分组排序
  function derive(record) {
    maxBoard = 1;
    record.stocks.forEach(function (s) {
      if (s.boards > maxBoard) maxBoard = s.boards;
    });

    levels = [];
    for (var i = 1; i <= maxBoard; i++) levels.push(i);

    var map = {};
    record.stocks.forEach(function (s) {
      if (!map[s.theme]) map[s.theme] = { name: s.theme, stocks: [], maxBoard: 0, count: 0 };
      map[s.theme].stocks.push(s);
      map[s.theme].count++;
      if (s.boards > map[s.theme].maxBoard) map[s.theme].maxBoard = s.boards;
    });

    themes = Object.keys(map).map(function (k) { return map[k]; });
    // 按强度排序：最高板降序 → 涨停数降序 → 名称
    themes.sort(function (a, b) {
      if (b.maxBoard !== a.maxBoard) return b.maxBoard - a.maxBoard;
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name, "zh");
    });
    themes.forEach(function (t) {
      t.stocks.sort(function (a, b) {
        if (b.boards !== a.boards) return b.boards - a.boards;
        return a.name.localeCompare(b.name, "zh");
      });
    });
  }

  // ===== 渲染 =====
  function renderAll() {
    var weekday = WEEKDAYS[new Date(current.date + "T00:00:00Z").getUTCDay()];
    $date.textContent = current.date + " 复盘 · " + weekday;
    if (current.note) {
      $note.textContent = current.note;
      $note.style.display = "block";
    } else {
      $note.style.display = "none";
    }
    renderStats();
    renderTable();
  }

  function renderStats() {
    var stocks = current.stocks;
    var total = stocks.length;
    var lianban = stocks.filter(function (s) { return s.boards >= 2; }).length;
    var kongjian = stocks.filter(function (s) { return s.boards === maxBoard; })
      .map(function (s) { return s.name; }).join("、");

    var tiles = [
      { label: "涨停家数", value: String(total), sub: "" },
      { label: "连板家数", value: String(lianban), sub: "≥2板" },
      { label: "最高板", value: maxBoard + "板", sub: kongjian ? kongjian + " · 空间板" : "" },
      { label: "活跃题材", value: String(themes.length), sub: "" }
    ];

    $statTiles.innerHTML = tiles.map(function (t) {
      return '<div class="stat-tile">' +
        '<span class="stat-label">' + esc(t.label) + '</span>' +
        '<span class="stat-value">' + esc(t.value) + '</span>' +
        (t.sub ? '<span class="stat-sub">' + esc(t.sub) + '</span>' : "") +
        '</div>';
    }).join("");
  }

  // ===== 连板生态趋势折线图（ECharts，全部交易日） =====
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // 汇总全部交易日：各板层每日数量 + 每日最高板
  function trendData() {
    var dates = records.map(function (r) { return r.date; });
    var defs = [
      { name: "首板", min: 1, max: 1 },
      { name: "二板", min: 2, max: 2 },
      { name: "三板", min: 3, max: 3 },
      { name: "四板", min: 4, max: 4 },
      { name: "五板", min: 5, max: 5 },
      { name: "六板", min: 6, max: 6 },
      { name: "七板", min: 7, max: 7 },
      { name: "八板+", min: 8, max: Infinity }
    ];
    var counts = defs.map(function (def) {
      return records.map(function (r) {
        return r.stocks.filter(function (s) {
          return s.boards >= def.min && s.boards <= def.max;
        }).length;
      });
    });
    var heights = records.map(function (r) {
      return r.stocks.reduce(function (m, s) { return Math.max(m, s.boards); }, 1);
    });
    return {
      dates: dates,
      names: defs.map(function (d) { return d.name; }),
      counts: counts,
      heights: heights
    };
  }

  function buildTrendOption() {
    var c = {
      board1: cssVar("--mr-board-1"),
      lv2: cssVar("--mr-lv-2"),
      lv3: cssVar("--mr-lv-3"),
      lv4: cssVar("--mr-lv-4"),
      lv5: cssVar("--mr-lv-5"),
      lv6: cssVar("--mr-lv-6"),
      lv7: cssVar("--mr-lv-7p"),
      lv8: cssVar("--mr-lv-8p"),
      text: cssVar("--color-text"),
      textSecondary: cssVar("--color-text-secondary"),
      muted: cssVar("--color-muted"),
      border: cssVar("--color-border"),
      surface: cssVar("--color-surface")
    };
    var td = trendData();
    var n = records.length;

    // 全零系列默认不勾选（仍可在图例中打开）
    var autoHide = {};
    td.counts.forEach(function (values, i) {
      if (values.every(function (v) { return v === 0; })) autoHide[td.names[i]] = false;
    });

    // 超过 10 个交易日时：默认展示最近 10 天，并出现底部滑块可左右滑动
    var zoomStart = n > 10 ? Math.round((1 - 10 / n) * 100) : 0;

    // 柱段色与天梯表 chip 色阶一致；每天一列，各板层段自下而上堆叠（首板在底 = 阶梯向上）
    var levelColors = [c.board1, c.lv2, c.lv3, c.lv4, c.lv5, c.lv6, c.lv7, c.lv8];
    var series = td.names.map(function (name, i) {
      return {
        id: i === 0 ? "board1" : "lv" + (i + 1),
        name: name,
        type: "bar",
        stack: "boards",
        data: td.counts[i],
        barMaxWidth: 24,
        itemStyle: {
          color: levelColors[i],
          borderColor: c.surface,  // 相邻段各 1px 边框 = 段间 2px 表面色间隙
          borderWidth: 1
        },
        emphasis: { focus: "series" }
      };
    });

    // 高度：每日最高板（虚线 + 表面环圆点 + 稀疏直接标注）
    series.push({
      id: "height",
      name: "高度",
      type: "line",
      data: td.heights,
      lineStyle: { width: 2, type: "dashed", color: c.text },
      itemStyle: { color: c.text, borderColor: c.surface, borderWidth: 2 }, // 2px 表面环
      symbol: "circle",
      symbolSize: 7,
      z: 10,
      emphasis: { focus: "series" },
      label: {
        show: true,
        position: "top",
        distance: 8,
        color: c.textSecondary,
        fontSize: 11,
        backgroundColor: c.surface,
        padding: [2, 5],
        borderRadius: 4,
        formatter: function (p) {
          // 天数少时全部标注；天数多时只标末点
          if (n > 12 && p.dataIndex !== n - 1) return "";
          return p.value + "板";
        }
      },
      markLine: {
        silent: true,
        symbol: "none",
        lineStyle: { type: "dashed", color: c.muted, width: 1 },
        data: currentIndex >= 0 && current ? [{ xAxis: current.date }] : []
      }
    });

    var option = {
      legend: {
        type: "scroll",
        top: 0,
        left: 0,
        right: 0,
        itemWidth: 14,
        itemHeight: 10,
        textStyle: { color: c.textSecondary, fontSize: 11 },
        selected: autoHide
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: c.surface,
        borderColor: c.border,
        padding: [8, 12],
        textStyle: { color: c.text, fontSize: 12 },
        formatter: function (params) {
          var html = '<div style="font-weight:600;margin-bottom:4px;">' + esc(params[0].axisValue) + "</div>";
          var total = 0;
          params.forEach(function (p) {
            if (p.seriesType === "bar") {
              total += p.value;
              html += '<div style="display:flex;align-items:center;gap:6px;">' +
                p.marker + esc(p.seriesName) +
                '<span style="margin-left:auto;padding-left:16px;font-weight:600;">' +
                p.value + "只</span></div>";
            } else {
              html += '<div style="display:flex;align-items:center;gap:6px;">' +
                p.marker + esc(p.seriesName) +
                '<span style="margin-left:auto;padding-left:16px;font-weight:600;">' +
                p.value + "板</span></div>";
            }
          });
          html += '<div style="border-top:1px solid ' + c.border +
            ';margin-top:4px;padding-top:4px;display:flex;">' +
            "<span>合计</span>" +
            '<span style="margin-left:auto;font-weight:600;">' + total + "只</span></div>";
          return html;
        }
      },
      grid: { left: 44, right: 16, top: 40, bottom: n > 10 ? 48 : 30 },
      xAxis: {
        type: "category",
        boundaryGap: true,
        data: td.dates,
        axisLine: { lineStyle: { color: c.border } },
        axisTick: { show: false },
        axisLabel: {
          color: c.textSecondary,
          fontSize: 11,
          formatter: function (v) {
            // 单行「MM-DD 周X」，避免两行标签超出 grid 底部被裁切
            return v.slice(5) + " " + WEEKDAYS[new Date(v + "T00:00:00Z").getUTCDay()];
          }
        }
      },
      yAxis: {
        type: "value",
        min: 0,
        minInterval: 1,
        axisLabel: { color: c.textSecondary, fontSize: 11 },
        splitLine: { lineStyle: { color: c.border, width: 1 } }
      },
      dataZoom: [
        { type: "inside", xAxisIndex: 0, start: zoomStart, end: 100 }
      ].concat(n > 10 ? [{
        type: "slider",
        xAxisIndex: 0,
        start: zoomStart,
        end: 100,
        height: 18,
        bottom: 2,
        borderColor: c.border,
        backgroundColor: "transparent",
        fillerColor: "rgba(128,128,128,0.15)",
        handleStyle: { color: c.textSecondary },
        textStyle: { color: c.textSecondary, fontSize: 10 }
      }] : []),
      series: series
    };
    return option;
  }

  function renderTrendChart() {
    if (typeof echarts === "undefined") {
      $trend.innerHTML = '<p class="mr-chart-fallback">图表库（ECharts CDN）加载失败，请检查网络后刷新。</p>';
      return;
    }
    if (!trendChart) {
      trendChart = echarts.init($trend);
    }
    trendChart.setOption(buildTrendOption(), true);
    trendChart.resize();
  }

  // 切换交易日时移动“当前日”标记线（保留用户缩放状态）
  function updateTrendMarkline() {
    if (!trendChart) return;
    trendChart.setOption({
      series: [{
        id: "height",
        markLine: { data: currentIndex >= 0 && current ? [{ xAxis: current.date }] : [] }
      }]
    });
  }

  // 核心视图：题材 × 板数 天梯矩阵
  function renderTable() {
    var html = "";

    // 表头：题材 + 各板层（含数量）
    html += "<thead><tr>";
    html += '<th class="col-theme" scope="col">题材</th>';
    levels.forEach(function (lv) {
      var count = current.stocks.filter(function (s) { return s.boards === lv; }).length;
      html += '<th class="col-' + lv + '" scope="col" data-level="' + lv + '" title="点击聚焦 ' + lv + '板">' +
        '<span class="lv-header">' +
        '<span class="lv-swatch ' + lvClass("swatch", lv) + '"></span>' +
        '<span class="lv-name">' + lv + '板</span>' +
        '<span class="lv-count">×' + count + '</span>' +
        '</span></th>';
    });
    html += "</tr></thead>";

    // 表体：每个题材一行，格内为该题材在该板层的股票
    html += "<tbody>";
    var term = searchTerm.trim().toLowerCase();

    themes.forEach(function (theme) {
      var visibleStocks = term
        ? theme.stocks.filter(function (s) {
            return s.name.toLowerCase().indexOf(term) >= 0 ||
              s.code.toLowerCase().indexOf(term) >= 0;
          })
        : null;
      var themeHit = term && theme.name.toLowerCase().indexOf(term) >= 0;

      if (term && !themeHit && (!visibleStocks || visibleStocks.length === 0)) return; // 无命中行隐藏

      html += '<tr data-theme="' + escAttr(theme.name) + '">';
      html += '<th class="cell-theme" scope="row" title="点击聚焦该题材梯队">' +
        '<span class="theme-name">' + esc(theme.name) + '</span>' +
        '<span class="theme-count">' + theme.count + '只 · 最高' + theme.maxBoard + '板</span>' +
        '</th>';

      levels.forEach(function (lv) {
        var stocks = theme.stocks.filter(function (s) { return s.boards === lv; });
        if (!stocks.length) {
          html += '<td class="col-' + lv + '"></td>';
          return;
        }
        html += '<td class="col-' + lv + '"><div class="chip-list">' +
          stocks.map(function (s) {
            var cls = "stock-chip " + lvClass("chip", s.boards);
            if (s.boards === maxBoard) cls += " crown-chip";
            if (term && !themeHit &&
                (s.name.toLowerCase().indexOf(term) >= 0 || s.code.toLowerCase().indexOf(term) >= 0)) {
              cls += " hit";
            }
            var crown = s.boards === maxBoard ? "👑" : "";
            return '<span class="' + cls + '" tabindex="0"' +
              ' data-code="' + escAttr(s.code) + '"' +
              ' data-name="' + escAttr(s.name) + '"' +
              ' data-boards="' + s.boards + '"' +
              ' data-theme="' + escAttr(s.theme) + '"' +
              ' title="' + escAttr(s.name + " · " + s.code + " · " + s.boards + "板 · " + s.theme) + '">' +
              crown + esc(s.name) + "</span>";
          }).join("") +
          "</div></td>";
      });

      html += "</tr>";
    });
    html += "</tbody>";

    $table.innerHTML = html;
    applyFocus();
  }

  // ===== 聚焦（点击题材行 / 列头） =====
  function applyFocus() {
    var rows = $table.querySelectorAll("tbody tr");
    rows.forEach(function (tr) {
      var isFocus = focusTheme && tr.getAttribute("data-theme") === focusTheme;
      tr.classList.toggle("focused", isFocus);
      tr.classList.toggle("dimmed", focusTheme !== "" && !isFocus);
    });

    var cells = $table.querySelectorAll("tbody td, thead th");
    cells.forEach(function (cell) {
      if (cell.classList.contains("col-theme") || cell.classList.contains("cell-theme")) return;
      var isFocus = focusCol > 0 && cell.classList.contains("col-" + focusCol);
      cell.classList.toggle("dimmed", focusCol > 0 && !isFocus);
    });
  }

  function clearFocus() {
    focusCol = 0;
    focusTheme = "";
    applyFocus();
  }

  // ===== 悬浮提示 =====
  function showTooltip(e, chip) {
    var boards = parseInt(chip.getAttribute("data-boards"), 10);
    var label = boards >= 2 ? boards + "板" : "首板";
    $tooltip.innerHTML = '<span class="tt-name">' + esc(chip.getAttribute("data-name")) + '</span>' +
      esc(chip.getAttribute("data-code")) + " · " + label + " · " + esc(chip.getAttribute("data-theme"));
    $tooltip.hidden = false;
    moveTooltip(e);
  }

  function moveTooltip(e) {
    var pad = 12;
    var x = e.clientX + pad;
    var y = e.clientY + pad;
    var rect = $tooltip.getBoundingClientRect();
    if (x + rect.width > window.innerWidth - 8) x = e.clientX - rect.width - pad;
    if (y + rect.height > window.innerHeight - 8) y = e.clientY - rect.height - pad;
    $tooltip.style.left = x + "px";
    $tooltip.style.top = y + "px";
  }

  function hideTooltip() {
    $tooltip.hidden = true;
  }

  // ===== 工具 =====
  function lvClass(prefix, boards) {
    if (boards <= 1) return prefix + "-lv1";
    var idx = Math.min(boards, MAX_FILL_LEVEL);
    return prefix + "-lv" + (idx === MAX_FILL_LEVEL ? "7p" : idx);
  }

  function esc(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  function escAttr(str) {
    return esc(str).replace(/"/g, "&quot;");
  }

  // ===== 事件绑定 =====
  $themeToggle.addEventListener("click", toggleTheme);

  $navPrev.addEventListener("click", goPrev);
  $navNext.addEventListener("click", goNext);
  $navLatest.addEventListener("click", goLatest);

  $navDate.addEventListener("change", function () {
    if ($navDate.value) showDate($navDate.value);
  });

  $search.addEventListener("input", function () {
    searchTerm = $search.value;
    renderTable();
  });

  $onlyLianban.addEventListener("click", function () {
    var on = $table.classList.toggle("hide-board1");
    $onlyLianban.classList.toggle("active", on);
    $onlyLianban.setAttribute("aria-pressed", on ? "true" : "false");
  });

  $table.addEventListener("click", function (e) {
    // 列头聚焦
    var th = e.target.closest ? e.target.closest("thead th[data-level]") : null;
    if (th) {
      var lv = parseInt(th.getAttribute("data-level"), 10);
      focusCol = focusCol === lv ? 0 : lv;
      focusTheme = "";
      applyFocus();
      return;
    }
    // 题材行聚焦
    var row = e.target.closest ? e.target.closest("tbody tr") : null;
    if (row && (e.target.classList.contains("cell-theme") ||
        e.target.closest("th.cell-theme"))) {
      var name = row.getAttribute("data-theme");
      focusTheme = focusTheme === name ? "" : name;
      focusCol = 0;
      applyFocus();
    }
  });

  // chip 悬浮提示（事件委托）
  $table.addEventListener("mouseover", function (e) {
    var chip = e.target.closest ? e.target.closest(".stock-chip") : null;
    if (chip) showTooltip(e, chip);
  });

  $table.addEventListener("mousemove", function (e) {
    if (!$tooltip.hidden) moveTooltip(e);
  });

  $table.addEventListener("mouseout", function (e) {
    var chip = e.target.closest ? e.target.closest(".stock-chip") : null;
    if (chip) hideTooltip();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") clearFocus();
  });

  window.addEventListener("resize", function () {
    if (trendChart) trendChart.resize();
  });

  // ===== 启动 =====
  initTheme();
  loadData();
})();
