(function () {
  "use strict";

  // ===== 状态 =====
  var entries = [];
  var allTags = [];
  var selectedTags = [];
  var selectedMood = "";
  var searchQuery = "";
  var activeRoute = "timeline";
  var activeEntryId = null;

  // ===== DOM 引用 =====
  var $loading = document.getElementById("loading");
  var $error = document.getElementById("error");
  var $entriesContainer = document.getElementById("entries-container");
  var $noResults = document.getElementById("no-results");
  var $searchInput = document.getElementById("search-input");
  var $moodFilter = document.getElementById("mood-filter");
  var $tagFilters = document.getElementById("tag-filters");
  var $clearFilters = document.getElementById("clear-filters");
  var $themeToggle = document.getElementById("theme-toggle");
  var $noResultsClear = document.getElementById("no-results-clear");

  // ===== Markdown 渲染 =====
  var markedConfigured = false;

  function configureMarked() {
    if (markedConfigured) return;
    markedConfigured = true;
    if (typeof marked === "undefined") return;

    try {
      // 自定义图片渲染：添加 loading="lazy"
      var renderer = null;
      // marked v5+: marked.Renderer 仍然是构造函数
      if (typeof marked.Renderer === "function") {
        renderer = new marked.Renderer();
      }

      if (renderer) {
        var origImage = renderer.image.bind(renderer);
        renderer.image = function (href, title, text) {
          var titleAttr = title ? ' title="' + title + '"' : "";
          return (
            '<img src="' +
            href +
            '" alt="' +
            (text || "") +
            '"' +
            titleAttr +
            ' loading="lazy">'
          );
        };

        // marked v5+ 使用 marked.use()，v4 使用 marked.setOptions()
        if (typeof marked.use === "function") {
          marked.use({ renderer: renderer });
        } else if (typeof marked.setOptions === "function") {
          marked.setOptions({ renderer: renderer });
        }
      }
    } catch (e) {
      console.warn("Markdown 配置失败:", e);
    }
  }

  function renderMarkdown(text) {
    if (!text) return "";
    try {
      if (typeof marked !== "undefined") {
        configureMarked();
        // marked v5+ 使用 marked.parse()，v4 及以下使用 marked()
        if (typeof marked.parse === "function") {
          return marked.parse(text);
        } else if (typeof marked === "function") {
          return marked(text);
        }
      }
    } catch (e) {
      console.warn("Markdown 渲染失败，使用纯文本降级:", e);
    }
    return escapeHtml(text)
      .replace(/\n\n/g, "</p><p>")
      .replace(/\n/g, "<br>");
  }

  // ===== 工具函数 =====
  function escapeHtml(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function moodEmoji(mood) {
    var map = {
      happy: "😊",
      sad: "😢",
      neutral: "😐",
      excited: "🎉",
      anxious: "😰",
    };
    return map[mood] || "";
  }

  function formatDate(dateStr) {
    var d = new Date(dateStr + "T00:00:00");
    return (
      d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日"
    );
  }

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
  function loadEntries() {
    $loading.style.display = "block";
    $error.style.display = "none";
    $entriesContainer.style.display = "none";
    $noResults.style.display = "none";

    fetch("data/entries.json")
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (data) {
        entries = [];
        allTags = [];
        var tagSet = {};
        if (data.entries && Array.isArray(data.entries)) {
          data.entries.forEach(function (entry, index) {
            if (!entry.id || !entry.date) {
              console.warn("跳过无效条目（缺少 id 或 date）:", entry);
              return;
            }
            entries.push({
              id: entry.id,
              date: entry.date,
              title: entry.title || "",
              content: entry.content || "",
              mood: entry.mood || "",
              tags: entry.tags || [],
            });
            if (entry.tags && Array.isArray(entry.tags)) {
              entry.tags.forEach(function (tag) {
                if (!tagSet[tag]) {
                  tagSet[tag] = true;
                  allTags.push(tag);
                }
              });
            }
          });
        }
        allTags.sort();
        initFilters();
        handleRoute();
      })
      .catch(function (err) {
        console.error("加载日记数据失败:", err);
        $loading.style.display = "none";
        $error.style.display = "block";
      });
  }

  // ===== 筛选初始化 =====
  function initFilters() {
    // 渲染标签 chips
    $tagFilters.innerHTML = "";
    allTags.forEach(function (tag) {
      var chip = document.createElement("span");
      chip.className = "tag-chip";
      chip.textContent = tag;
      chip.dataset.tag = tag;
      chip.addEventListener("click", function () {
        toggleTag(tag);
      });
      $tagFilters.appendChild(chip);
    });
  }

  function toggleTag(tag) {
    var idx = selectedTags.indexOf(tag);
    if (idx > -1) {
      selectedTags.splice(idx, 1);
    } else {
      selectedTags.push(tag);
    }
    updateUI();
  }

  function updateTagChips() {
    var chips = $tagFilters.querySelectorAll(".tag-chip");
    chips.forEach(function (chip) {
      if (selectedTags.indexOf(chip.dataset.tag) > -1) {
        chip.classList.add("active");
      } else {
        chip.classList.remove("active");
      }
    });
  }

  function hasActiveFilters() {
    return selectedTags.length > 0 || selectedMood !== "" || searchQuery !== "";
  }

  // ===== 筛选逻辑 =====
  function filterEntries() {
    return entries.filter(function (entry) {
      // 标签筛选（多选，AND 逻辑）
      if (selectedTags.length > 0) {
        var hasAll = selectedTags.every(function (tag) {
          return entry.tags.indexOf(tag) > -1;
        });
        if (!hasAll) return false;
      }
      // 心情筛选
      if (selectedMood && entry.mood !== selectedMood) return false;
      // 搜索
      if (searchQuery) {
        var q = searchQuery.toLowerCase();
        var inTitle =
          entry.title && entry.title.toLowerCase().indexOf(q) > -1;
        var inContent =
          entry.content && entry.content.toLowerCase().indexOf(q) > -1;
        var inTags = entry.tags.some(function (tag) {
          return tag.toLowerCase().indexOf(q) > -1;
        });
        if (!inTitle && !inContent && !inTags) return false;
      }
      return true;
    });
  }

  // ===== 渲染 =====
  function renderTimeline(filtered) {
    $loading.style.display = "none";
    $error.style.display = "none";

    if (filtered.length === 0) {
      $entriesContainer.style.display = "none";
      $noResults.style.display = "block";
      return;
    }

    $noResults.style.display = "none";
    $entriesContainer.style.display = "block";

    // 按年份分组
    var groups = {};
    filtered.forEach(function (entry) {
      var year = entry.date.substring(0, 4);
      if (!groups[year]) groups[year] = [];
      groups[year].push(entry);
    });

    var years = Object.keys(groups).sort().reverse();

    var html = "";
    years.forEach(function (year) {
      html += '<div class="year-group">';
      html += '<div class="year-label">' + escapeHtml(year) + " 年</div>";
      groups[year].forEach(function (entry) {
        html += renderEntryCard(entry);
      });
      html += "</div>";
    });

    $entriesContainer.innerHTML = html;
  }

  function renderEntryCard(entry) {
    var title = entry.title || formatDate(entry.date);
    var moodHtml = entry.mood
      ? '<span class="entry-mood">' + moodEmoji(entry.mood) + "</span>"
      : "";
    var tagsHtml = "";
    if (entry.tags && entry.tags.length > 0) {
      tagsHtml = '<div class="entry-tags">';
      entry.tags.forEach(function (tag) {
        tagsHtml += '<span class="entry-tag">' + escapeHtml(tag) + "</span>";
      });
      tagsHtml += "</div>";
    }

    return (
      '<details class="entry-card" data-id="' +
      escapeHtml(entry.id) +
      '">' +
      '<summary class="entry-summary">' +
      '<span class="entry-date">' +
      escapeHtml(entry.date) +
      "</span>" +
      '<span class="entry-title">' +
      escapeHtml(title) +
      "</span>" +
      moodHtml +
      "</summary>" +
      '<div class="entry-detail">' +
      '<div class="entry-content">' +
      renderMarkdown(entry.content) +
      "</div>" +
      tagsHtml +
      "</div>" +
      "</details>"
    );
  }

  function renderSingleEntry(entry) {
    $loading.style.display = "none";
    $error.style.display = "none";
    $noResults.style.display = "none";
    $entriesContainer.style.display = "block";

    var title = entry.title || formatDate(entry.date);
    var moodHtml = entry.mood
      ? '<span class="entry-mood">' + moodEmoji(entry.mood) + "</span>"
      : "";
    var tagsHtml = "";
    if (entry.tags && entry.tags.length > 0) {
      tagsHtml = '<div class="entry-tags">';
      entry.tags.forEach(function (tag) {
        tagsHtml += '<span class="entry-tag">' + escapeHtml(tag) + "</span>";
      });
      tagsHtml += "</div>";
    }

    $entriesContainer.innerHTML =
      '<div class="entry-detail-page">' +
      '<a class="back-link" href="#/timeline">← 返回时间线</a>' +
      '<div class="entry-card">' +
      '<div class="entry-summary" style="cursor:default;">' +
      '<span class="entry-date">' +
      escapeHtml(entry.date) +
      "</span>" +
      '<span class="entry-title">' +
      escapeHtml(title) +
      "</span>" +
      moodHtml +
      "</div>" +
      '<div class="entry-detail">' +
      '<div class="entry-content">' +
      renderMarkdown(entry.content) +
      "</div>" +
      tagsHtml +
      "</div>" +
      "</div>" +
      "</div>";
  }

  function renderNotFound() {
    $loading.style.display = "none";
    $error.style.display = "none";
    $entriesContainer.style.display = "block";
    $noResults.style.display = "none";
    $entriesContainer.innerHTML =
      '<div class="no-results"><p>未找到该日记</p><a href="#/timeline">← 返回时间线</a></div>';
  }

  // ===== 路由 =====
  function handleRoute() {
    var hash = window.location.hash.replace(/^#/, "") || "/timeline";
    var match = hash.match(/^\/entry\/(.+)$/);

    if (match) {
      activeRoute = "entry";
      activeEntryId = match[1];
      var entry = null;
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].id === activeEntryId) {
          entry = entries[i];
          break;
        }
      }
      if (entry) {
        renderSingleEntry(entry);
      } else {
        renderNotFound();
      }
    } else {
      // 从 hash 恢复筛选状态
      activeRoute = "timeline";
      activeEntryId = null;
      if (hash !== "/timeline") {
        parseHashParams(hash);
      }
      updateUI();
    }
  }

  function parseHashParams(hash) {
    // 格式: #tag=生活,工作&mood=happy&q=关键词
    selectedTags = [];
    selectedMood = "";
    searchQuery = "";
    if (!hash || hash === "/timeline") return;
    var params = hash.split("&");
    params.forEach(function (param) {
      var parts = param.split("=");
      var key = decodeURIComponent(parts[0]);
      var val = parts[1] ? decodeURIComponent(parts[1]) : "";
      if (key === "tag" && val) {
        selectedTags = val.split(",");
      } else if (key === "mood") {
        selectedMood = val;
      } else if (key === "q") {
        searchQuery = val;
      }
    });
    // 同步到 UI
    $searchInput.value = searchQuery;
    $moodFilter.value = selectedMood;
  }

  function buildHash() {
    var parts = [];
    if (selectedTags.length > 0) {
      parts.push("tag=" + encodeURIComponent(selectedTags.join(",")));
    }
    if (selectedMood) {
      parts.push("mood=" + encodeURIComponent(selectedMood));
    }
    if (searchQuery) {
      parts.push("q=" + encodeURIComponent(searchQuery));
    }
    var newHash = parts.length > 0 ? "#" + parts.join("&") : "#/timeline";
    var currentHash = window.location.hash || "#";
    if (currentHash !== newHash) {
      history.replaceState(null, "", window.location.pathname + newHash);
    }
  }

  // ===== UI 更新 =====
  function updateUI() {
    updateTagChips();

    // 显示/隐藏清除按钮
    if (hasActiveFilters()) {
      $clearFilters.style.display = "inline-block";
    } else {
      $clearFilters.style.display = "none";
    }

    var filtered = filterEntries();
    renderTimeline(filtered);
    buildHash();
  }

  function clearAllFilters() {
    selectedTags = [];
    selectedMood = "";
    searchQuery = "";
    $searchInput.value = "";
    $moodFilter.value = "";
    updateUI();
  }

  // ===== 事件绑定 =====
  $themeToggle.addEventListener("click", toggleTheme);

  $searchInput.addEventListener("input", function () {
    searchQuery = $searchInput.value.trim();
    updateUI();
  });

  $moodFilter.addEventListener("change", function () {
    selectedMood = $moodFilter.value;
    updateUI();
  });

  $clearFilters.addEventListener("click", clearAllFilters);

  $noResultsClear.addEventListener("click", clearAllFilters);

  window.addEventListener("hashchange", handleRoute);

  // 点击卡片标题跳转到单条详情
  $entriesContainer.addEventListener("click", function (e) {
    var title = e.target.closest(".entry-title");
    if (title) {
      var card = title.closest(".entry-card");
      if (card && card.dataset.id) {
        e.preventDefault();
        window.location.hash = "#/entry/" + card.dataset.id;
      }
    }
  });

  // 图片 Lightbox：点击 entry-content 中的图片放大
  $entriesContainer.addEventListener("click", function (e) {
    var img = e.target.closest(".entry-content img");
    if (!img) return;
    e.preventDefault();

    var overlay = document.createElement("div");
    overlay.className = "lightbox-overlay";

    var cloned = document.createElement("img");
    cloned.src = img.src;
    cloned.alt = img.alt || "";
    overlay.appendChild(cloned);

    overlay.addEventListener("click", function () {
      document.body.removeChild(overlay);
    });

    // ESC 关闭
    var escHandler = function (ev) {
      if (ev.key === "Escape") {
        document.body.removeChild(overlay);
        document.removeEventListener("keydown", escHandler);
      }
    };
    document.addEventListener("keydown", escHandler);

    document.body.appendChild(overlay);
  });

  // ===== 启动 =====
  initTheme();
  loadEntries();
})();
