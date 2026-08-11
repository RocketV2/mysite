(function () {
  "use strict";

  // ===== localStorage key =====
  var STORAGE_KEY = "cognition_data";

  // ===== 状态 =====
  var categories = [];
  var items = [];
  var filteredItems = [];
  var currentCategoryId = null; // 分类筛选
  var dateFrom = "";
  var dateTo = "";
  var searchQuery = "";
  var readingMode = "reader"; // "reader" | "browse"
  var readerIndex = 0; // 当前精读位置（在 filteredItems 中的索引）
  var toastTimer = null;

  // ===== DOM 引用 =====
  var $loading = document.getElementById("loading");
  var $error = document.getElementById("error");
  var $contentArea = document.getElementById("content-area");
  var $emptyState = document.getElementById("empty-state");
  var $searchInput = document.getElementById("search-input");
  var $categoryFilter = document.getElementById("category-filter");
  var $dateFrom = document.getElementById("date-from");
  var $dateTo = document.getElementById("date-to");
  var $resultCount = document.getElementById("result-count");
  var $btnClearFilters = document.getElementById("btn-clear-filters");
  var $themeToggle = document.getElementById("theme-toggle");

  // ===== Markdown 渲染 =====
  var markedConfigured = false;

  function configureMarked() {
    if (markedConfigured) return;
    markedConfigured = true;
    if (typeof marked === "undefined") return;
    try {
      if (typeof marked.use === "function") {
        marked.use({
          gfm: true,
          breaks: false,
        });
      } else if (typeof marked.setOptions === "function") {
        marked.setOptions({ gfm: true, breaks: false });
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
        if (typeof marked.parse === "function") {
          return marked.parse(text);
        } else if (typeof marked === "function") {
          return marked(text);
        }
      }
    } catch (e) {
      console.warn("Markdown 渲染失败:", e);
    }
    return escapeHtml(text).replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>");
  }

  // ===== 工具函数 =====
  function escapeHtml(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function formatDate(dateStr) {
    if (!dateStr) return "";
    var d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime())) return dateStr;
    return d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日";
  }

  function generateId() {
    return "cog-" + Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 8);
  }

  function getCategoryById(id) {
    for (var i = 0; i < categories.length; i++) {
      if (categories[i].id === id) return categories[i];
    }
    return null;
  }

  // ===== Toast =====
  function showToast(message, type) {
    type = type || "info";
    var container = document.getElementById("toast-container");
    var toast = document.createElement("div");
    toast.className = "cog-toast cog-toast-" + type;
    toast.textContent = message;
    container.appendChild(toast);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 2500);
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
  function loadData() {
    $loading.style.display = "block";
    $error.style.display = "none";
    $contentArea.style.display = "none";
    $emptyState.style.display = "none";

    fetch("data/cognition.json")
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (data) {
        var jsonCategories = data.categories || [];
        var jsonItems = data.items || [];

        // 从 localStorage 读取本地数据
        var localData = null;
        try {
          var raw = localStorage.getItem(STORAGE_KEY);
          if (raw) localData = JSON.parse(raw);
        } catch (e) {
          console.warn("localStorage 数据解析失败:", e);
        }

        if (localData && localData.categories && localData.items) {
          // 合并策略：localStorage 为主，JSON 中新增的追加
          categories = localData.categories;

          // 合并分类：JSON 中有但 localStorage 中没有的追加
          var localCatIds = {};
          categories.forEach(function (c) { localCatIds[c.id] = true; });
          jsonCategories.forEach(function (c) {
            if (!localCatIds[c.id]) {
              categories.push(c);
            }
          });

          // 合并条目：localStorage 为主，JSON 中有但 localStorage 中没有的追加
          items = localData.items;
          var localItemIds = {};
          items.forEach(function (item) { localItemIds[item.id] = true; });
          jsonItems.forEach(function (item) {
            if (!localItemIds[item.id]) {
              items.push(item);
            }
          });
        } else {
          // 首次加载：直接使用 JSON 数据
          categories = jsonCategories;
          items = jsonItems;
          saveData();
        }

        initUI();
      })
      .catch(function (err) {
        console.error("加载认知数据失败:", err);
        // 尝试从 localStorage 加载
        try {
          var raw = localStorage.getItem(STORAGE_KEY);
          if (raw) {
            var localData = JSON.parse(raw);
            categories = localData.categories || [];
            items = localData.items || [];
            initUI();
            showToast("已从本地缓存加载数据", "info");
            return;
          }
        } catch (e) {}
        $loading.style.display = "none";
        $error.style.display = "block";
      });
  }

  function saveData() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ categories: categories, items: items })
      );
    } catch (e) {
      console.warn("保存到 localStorage 失败:", e);
      showToast("保存失败，存储空间不足", "error");
    }
  }

  function reloadFromJSON() {
    localStorage.removeItem(STORAGE_KEY);
    showToast("已清空本地缓存，正在重新加载...", "info");
    loadData();
  }

  // ===== 筛选逻辑 =====
  function applyFilters() {
    filteredItems = items.filter(function (item) {
      // 分类筛选
      if (currentCategoryId && item.categoryId !== currentCategoryId) return false;

      // 日期范围
      if (dateFrom && item.date < dateFrom) return false;
      if (dateTo && item.date > dateTo) return false;

      // 关键词搜索（标题 + 内容）
      if (searchQuery) {
        var q = searchQuery.toLowerCase();
        var inTitle = item.title && item.title.toLowerCase().indexOf(q) > -1;
        var inContent = item.content && item.content.toLowerCase().indexOf(q) > -1;
        if (!inTitle && !inContent) return false;
      }

      return true;
    });

    // 按日期降序排列
    filteredItems.sort(function (a, b) {
      if (a.date > b.date) return -1;
      if (a.date < b.date) return 1;
      return 0;
    });

    // 更新结果计数
    $resultCount.textContent = "共 " + filteredItems.length + " 篇";
  }

  function hasActiveFilters() {
    return currentCategoryId !== "" || dateFrom !== "" || dateTo !== "" || searchQuery !== "";
  }

  // ===== UI 初始化 =====
  function initUI() {
    // 更新分类筛选下拉
    updateCategoryFilter();

    // 从 hash 恢复状态
    restoreStateFromHash();

    // 渲染
    applyFilters();
    renderCurrentView();

    $loading.style.display = "none";
    $error.style.display = "none";
  }

  function updateCategoryFilter() {
    var html = '<option value="">全部分类</option>';
    categories.forEach(function (cat) {
      var sel = currentCategoryId === cat.id ? " selected" : "";
      html += '<option value="' + escapeHtml(cat.id) + '"' + sel + ">" + (cat.icon || "") + " " + escapeHtml(cat.name) + "</option>";
    });
    $categoryFilter.innerHTML = html;
  }

  // ===== Hash 状态 =====
  function restoreStateFromHash() {
    var hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;

    var params = hash.split("&");
    params.forEach(function (param) {
      var parts = param.split("=");
      var key = decodeURIComponent(parts[0]);
      var val = parts[1] ? decodeURIComponent(parts[1]) : "";

      if (key === "cat" && val) currentCategoryId = val;
      else if (key === "df" && val) dateFrom = val;
      else if (key === "dt" && val) dateTo = val;
      else if (key === "q" && val) searchQuery = val;
      else if (key === "mode" && (val === "reader" || val === "browse")) readingMode = val;
      else if (key === "idx" && val) readerIndex = parseInt(val, 10) || 0;
    });

    // 同步 UI
    $searchInput.value = searchQuery;
    $categoryFilter.value = currentCategoryId;
    $dateFrom.value = dateFrom;
    $dateTo.value = dateTo;

    // 同步模式按钮
    if (readingMode === "browse") {
      document.getElementById("mode-reader").classList.remove("active");
      document.getElementById("mode-browse").classList.add("active");
    } else {
      document.getElementById("mode-reader").classList.add("active");
      document.getElementById("mode-browse").classList.remove("active");
    }
  }

  function saveStateToHash() {
    var parts = [];
    if (currentCategoryId) parts.push("cat=" + encodeURIComponent(currentCategoryId));
    if (dateFrom) parts.push("df=" + encodeURIComponent(dateFrom));
    if (dateTo) parts.push("dt=" + encodeURIComponent(dateTo));
    if (searchQuery) parts.push("q=" + encodeURIComponent(searchQuery));
    if (readingMode !== "reader") parts.push("mode=" + readingMode);
    if (readingMode === "reader" && readerIndex > 0) parts.push("idx=" + readerIndex);

    var newHash = parts.length > 0 ? "#" + parts.join("&") : "";
    var currentHash = window.location.hash;
    if (currentHash !== newHash) {
      history.replaceState(null, "", window.location.pathname + newHash);
    }
  }

  // ===== 渲染 =====
  function renderCurrentView() {
    if (filteredItems.length === 0) {
      $contentArea.style.display = "none";
      $emptyState.style.display = "block";
    } else {
      $emptyState.style.display = "none";
      $contentArea.style.display = "block";
      if (readingMode === "reader") {
        renderReaderView();
      } else {
        renderBrowseView();
      }
    }

    // 清除筛选按钮
    $btnClearFilters.style.display = hasActiveFilters() ? "inline-block" : "none";

    saveStateToHash();
  }

  // ---- 单篇精读模式 ----
  function renderReaderView() {
    // 边界检查
    if (readerIndex < 0) readerIndex = 0;
    if (readerIndex >= filteredItems.length) readerIndex = filteredItems.length - 1;

    var item = filteredItems[readerIndex];
    var cat = getCategoryById(item.categoryId);
    var catName = cat ? cat.name : "未分类";
    var catColor = cat ? cat.color : "#999";
    var catIcon = cat ? cat.icon : "";

    var html = '<div class="cog-reader-container">';
    html += '<div class="cog-reader-card">';
    html += '<div class="cog-reader-body">';

    // 元信息行
    html += '<div class="cog-reader-meta">';
    html += '<span class="cog-reader-date">' + formatDate(item.date) + "</span>";
    html += '<span class="cog-reader-category" style="background:' + catColor + ';">' + catIcon + " " + escapeHtml(catName) + "</span>";
    html += "</div>";

    // 标题
    html += '<h2 class="cog-reader-title">' + escapeHtml(item.title || "无标题") + "</h2>";

    // 装饰分隔线
    html += '<div class="cog-divider"><span class="cog-divider-dot"></span></div>';

    // 正文
    html += '<div class="cog-reader-content">' + renderMarkdown(item.content) + "</div>";

    // 操作按钮
    html += '<div class="cog-entry-actions">';
    html += '<button class="cog-btn cog-btn-sm" onclick="window._cogEditEntry(\'' + item.id + "')\">✏️ 编辑</button>";
    html += "</div>";

    html += "</div></div>";

    // 导航
    html += '<div class="cog-reader-nav">';
    if (readerIndex > 0) {
      html += '<button class="cog-nav-btn" id="btn-prev">← 上一篇</button>';
    } else {
      html += '<button class="cog-nav-btn" disabled>← 第一篇</button>';
    }
    html += '<span class="cog-nav-info">第 <span class="cog-nav-position">' + (readerIndex + 1) + "</span> / " + filteredItems.length + " 篇</span>";
    if (readerIndex < filteredItems.length - 1) {
      html += '<button class="cog-nav-btn" id="btn-next">下一篇 →</button>';
    } else {
      html += '<button class="cog-nav-btn" disabled>最后一篇 →</button>';
    }
    html += "</div>";

    // 键盘提示
    html += '<div class="cog-kbd-hint" style="margin-top:12px;">';
    html += '使用键盘 <span class="cog-kbd">←</span> <span class="cog-kbd">→</span> 切换文章';
    html += "</div>";

    html += "</div>";

    $contentArea.innerHTML = html;

    // 绑定导航事件
    var $btnPrev = document.getElementById("btn-prev");
    var $btnNext = document.getElementById("btn-next");
    if ($btnPrev) {
      $btnPrev.addEventListener("click", function () {
        if (readerIndex > 0) {
          readerIndex--;
          renderCurrentView();
          $contentArea.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    }
    if ($btnNext) {
      $btnNext.addEventListener("click", function () {
        if (readerIndex < filteredItems.length - 1) {
          readerIndex++;
          renderCurrentView();
          $contentArea.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    }
  }

  // ---- 快速浏览模式 ----
  function renderBrowseView() {
    var html = '<div class="cog-browse-list">';

    filteredItems.forEach(function (item) {
      var cat = getCategoryById(item.categoryId);
      var catName = cat ? cat.name : "未分类";
      var catColor = cat ? cat.color : "#999";
      var catIcon = cat ? cat.icon : "";

      html += '<details class="cog-browse-card" data-id="' + escapeHtml(item.id) + '">';
      html += '<summary class="cog-browse-summary">';
      html += '<span class="cog-browse-expand">▶</span>';
      html += '<span class="cog-browse-date">' + escapeHtml(item.date) + "</span>";
      html += '<span class="cog-browse-title">' + escapeHtml(item.title || "无标题") + "</span>";
      html += '<span class="cog-browse-category" style="background:' + catColor + ';">' + catIcon + " " + escapeHtml(catName) + "</span>";
      html += "</summary>";
      html += '<div class="cog-browse-detail">';
      html += '<div class="cog-browse-content">' + renderMarkdown(item.content) + "</div>";
      html += '<div class="cog-browse-actions">';
      html += '<button class="cog-btn cog-btn-sm" onclick="window._cogEditEntry(\'' + item.id + "')\">✏️ 编辑</button>";
      html += "</div>";
      html += "</div>";
      html += "</details>";
    });

    html += "</div>";
    $contentArea.innerHTML = html;
  }

  // ===== 编辑条目 =====
  function editEntry(entryId) {
    var item = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === entryId) {
        item = items[i];
        break;
      }
    }
    if (!item) return;

    // 填充表单
    document.getElementById("entry-edit-date").value = item.date;
    document.getElementById("entry-edit-title").value = item.title || "";
    document.getElementById("entry-edit-content").value = item.content || "";

    // 分类下拉
    var catSelect = document.getElementById("entry-edit-category");
    catSelect.innerHTML = '<option value="">未分类</option>';
    categories.forEach(function (cat) {
      var sel = item.categoryId === cat.id ? " selected" : "";
      catSelect.innerHTML += '<option value="' + escapeHtml(cat.id) + '"' + sel + ">" + (cat.icon || "") + " " + escapeHtml(cat.name) + "</option>";
    });

    document.getElementById("modal-entry-title").textContent = "编辑短文";
    document.getElementById("btn-entry-delete").style.display = "inline-block";
    document.getElementById("modal-entry-edit").dataset.entryId = entryId;
    showModal("modal-entry-edit");
  }

  function newEntry() {
    document.getElementById("entry-edit-date").value = new Date().toISOString().substring(0, 10);
    document.getElementById("entry-edit-title").value = "";
    document.getElementById("entry-edit-content").value = "";

    var catSelect = document.getElementById("entry-edit-category");
    catSelect.innerHTML = '<option value="">未分类</option>';
    categories.forEach(function (cat) {
      catSelect.innerHTML += '<option value="' + escapeHtml(cat.id) + '">' + (cat.icon || "") + " " + escapeHtml(cat.name) + "</option>";
    });
    if (currentCategoryId) catSelect.value = currentCategoryId;

    document.getElementById("modal-entry-title").textContent = "新建短文";
    document.getElementById("btn-entry-delete").style.display = "none";
    document.getElementById("modal-entry-edit").dataset.entryId = "";
    showModal("modal-entry-edit");
  }

  function saveEntry() {
    var entryId = document.getElementById("modal-entry-edit").dataset.entryId || "";
    var date = document.getElementById("entry-edit-date").value;
    var title = document.getElementById("entry-edit-title").value.trim();
    var content = document.getElementById("entry-edit-content").value;
    var categoryId = document.getElementById("entry-edit-category").value;

    if (!date) {
      showToast("请选择日期", "error");
      return;
    }
    if (!title && !content) {
      showToast("标题和内容至少填写一项", "error");
      return;
    }

    if (entryId) {
      // 编辑现有条目
      for (var i = 0; i < items.length; i++) {
        if (items[i].id === entryId) {
          items[i].date = date;
          items[i].title = title;
          items[i].content = content;
          items[i].categoryId = categoryId;
          break;
        }
      }
      showToast("短文已更新", "success");
    } else {
      // 新建条目
      items.push({
        id: generateId(),
        date: date,
        title: title,
        content: content,
        categoryId: categoryId,
        createdAt: new Date().toISOString(),
      });
      showToast("短文已创建", "success");
    }

    saveData();
    hideModal("modal-entry-edit");
    applyFilters();
    readerIndex = 0;
    renderCurrentView();
  }

  function deleteEntry() {
    var entryId = document.getElementById("modal-entry-edit").dataset.entryId;
    if (!entryId) return;

    showConfirm("确定要删除这篇短文吗？此操作不可撤销。", function () {
      items = items.filter(function (item) { return item.id !== entryId; });
      saveData();
      hideModal("modal-entry-edit");
      applyFilters();
      readerIndex = 0;
      renderCurrentView();
      showToast("短文已删除", "info");
    });
  }

  // ===== 分类管理 =====
  function openCategoryManager() {
    renderCategoryList();
    showModal("modal-categories");
  }

  function renderCategoryList() {
    var list = document.getElementById("category-list");
    var html = "";

    categories.forEach(function (cat) {
      var count = 0;
      items.forEach(function (item) {
        if (item.categoryId === cat.id) count++;
      });

      html += '<div class="cog-category-item">';
      html += '<span class="cog-category-icon-preview">' + (cat.icon || "📌") + "</span>";
      html += '<span class="cog-category-name">' + escapeHtml(cat.name) + "</span>";
      html += '<span class="cog-category-count">' + count + " 篇</span>";
      html += '<div class="cog-category-actions">';
      html += '<button class="cog-btn-sm" onclick="window._cogEditCategory(\'' + cat.id + "')\">✏️</button>";
      html += '<button class="cog-btn-sm cog-btn-sm-danger" onclick="window._cogDeleteCategory(\'' + cat.id + "')\">🗑</button>";
      html += "</div>";
      html += "</div>";
    });

    if (categories.length === 0) {
      html = '<p style="text-align:center;color:var(--cog-text-secondary);padding:20px;">还没有分类</p>';
    }

    list.innerHTML = html;
  }

  function openCategoryEditor(catId) {
    var cat = null;
    if (catId) {
      for (var i = 0; i < categories.length; i++) {
        if (categories[i].id === catId) {
          cat = categories[i];
          break;
        }
      }
    }

    document.getElementById("cat-edit-name").value = cat ? cat.name : "";
    document.getElementById("cat-edit-icon").value = cat ? cat.icon : "";
    document.getElementById("cat-edit-color").value = cat ? cat.color : "#d4915c";
    document.getElementById("modal-cat-edit-title").textContent = cat ? "编辑分类" : "新增分类";
    document.getElementById("modal-category-edit").dataset.catId = catId || "";

    // 颜色选择器
    var dots = document.querySelectorAll("#cat-color-picker .cog-color-dot");
    dots.forEach(function (dot) {
      dot.classList.remove("selected");
      if (dot.dataset.color === (cat ? cat.color : "#d4915c")) {
        dot.classList.add("selected");
      }
    });

    showModal("modal-category-edit");
  }

  function saveCategory() {
    var catId = document.getElementById("modal-category-edit").dataset.catId || "";
    var name = document.getElementById("cat-edit-name").value.trim();
    var icon = document.getElementById("cat-edit-icon").value.trim();
    var color = document.getElementById("cat-edit-color").value;

    if (!name) {
      showToast("请输入分类名称", "error");
      return;
    }

    if (catId) {
      // 编辑
      for (var i = 0; i < categories.length; i++) {
        if (categories[i].id === catId) {
          categories[i].name = name;
          categories[i].icon = icon || "📌";
          categories[i].color = color;
          break;
        }
      }
      showToast("分类已更新", "success");
    } else {
      // 新增
      categories.push({
        id: "cat-" + Date.now().toString(36),
        name: name,
        icon: icon || "📌",
        color: color,
      });
      showToast("分类已创建", "success");
    }

    saveData();
    hideModal("modal-category-edit");
    renderCategoryList();
    updateCategoryFilter();
    applyFilters();
    renderCurrentView();
  }

  function deleteCategory(catId) {
    // 检查是否有条目使用此分类
    var count = 0;
    items.forEach(function (item) {
      if (item.categoryId === catId) count++;
    });

    var msg = "确定要删除该分类吗？";
    if (count > 0) {
      msg += "其下 " + count + " 篇短文将变为「未分类」。";
    }

    showConfirm(msg, function () {
      categories = categories.filter(function (c) { return c.id !== catId; });
      // 将关联条目的 categoryId 置空
      items.forEach(function (item) {
        if (item.categoryId === catId) item.categoryId = "";
      });
      saveData();
      renderCategoryList();
      updateCategoryFilter();
      applyFilters();
      renderCurrentView();
      showToast("分类已删除", "info");
    });
  }

  // ===== 导入/导出 =====
  function openImport() {
    showModal("modal-import");
  }

  function importJSON(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = JSON.parse(e.target.result);
        var importItems = data.items || [];
        var importCategories = data.categories || [];

        if (importItems.length === 0) {
          showToast("文件中没有条目数据", "error");
          return;
        }

        // 合并分类
        var existingCatIds = {};
        categories.forEach(function (c) { existingCatIds[c.id] = true; });
        importCategories.forEach(function (c) {
          if (!existingCatIds[c.id]) {
            categories.push(c);
            existingCatIds[c.id] = true;
          }
        });

        // 合并条目（按 id）
        var existingItemIds = {};
        items.forEach(function (item) { existingItemIds[item.id] = true; });

        var addedCount = 0;
        var updatedCount = 0;
        importItems.forEach(function (importItem) {
          if (!importItem.id) return;
          if (existingItemIds[importItem.id]) {
            // 更新
            for (var i = 0; i < items.length; i++) {
              if (items[i].id === importItem.id) {
                items[i] = importItem;
                updatedCount++;
                break;
              }
            }
          } else {
            // 新增
            items.push(importItem);
            existingItemIds[importItem.id] = true;
            addedCount++;
          }
        });

        saveData();
        hideModal("modal-import");
        updateCategoryFilter();
        applyFilters();
        readerIndex = 0;
        renderCurrentView();
        showToast("导入完成：新增 " + addedCount + " 篇，更新 " + updatedCount + " 篇", "success");
      } catch (err) {
        console.error("导入失败:", err);
        showToast("JSON 解析失败，请检查文件格式", "error");
      }
    };
    reader.readAsText(file);
  }

  function exportJSON() {
    var data = {
      categories: categories,
      items: items,
    };
    var json = JSON.stringify(data, null, 2);
    var blob = new Blob([json], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "cognition.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("导出成功", "success");
  }

  // ===== 弹窗管理 =====
  function showModal(id) {
    document.getElementById(id).style.display = "flex";
    document.body.style.overflow = "hidden";
  }

  function hideModal(id) {
    document.getElementById(id).style.display = "none";
    document.body.style.overflow = "";
  }

  function showConfirm(message, onConfirm) {
    document.getElementById("confirm-text").textContent = message;
    showModal("modal-confirm");

    var btnYes = document.getElementById("btn-confirm-yes");
    var btnNo = document.getElementById("btn-confirm-no");
    var btnClose = document.getElementById("modal-confirm-close");

    function cleanup() {
      hideModal("modal-confirm");
      btnYes.removeEventListener("click", handler);
      btnNo.removeEventListener("click", cleanup);
      btnClose.removeEventListener("click", cleanup);
    }

    function handler() {
      cleanup();
      if (onConfirm) onConfirm();
    }

    btnYes.addEventListener("click", handler);
    btnNo.addEventListener("click", cleanup);
    btnClose.addEventListener("click", cleanup);
  }

  // ===== 全局事件 =====
  // 暴露函数到 window 供 HTML onclick 使用
  window._cogEditEntry = editEntry;
  window._cogEditCategory = function (catId) { openCategoryEditor(catId); };
  window._cogDeleteCategory = function (catId) { deleteCategory(catId); };

  // 弹窗关闭
  document.getElementById("modal-cat-close").addEventListener("click", function () {
    hideModal("modal-categories");
  });
  document.getElementById("modal-cat-edit-close").addEventListener("click", function () {
    hideModal("modal-category-edit");
  });
  document.getElementById("modal-entry-close").addEventListener("click", function () {
    hideModal("modal-entry-edit");
  });
  document.getElementById("modal-import-close").addEventListener("click", function () {
    hideModal("modal-import");
  });

  // 点击遮罩关闭弹窗
  var modalOverlays = document.querySelectorAll(".cog-modal-overlay");
  for (var m = 0; m < modalOverlays.length; m++) {
    (function (overlay) {
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) {
          overlay.style.display = "none";
          document.body.style.overflow = "";
        }
      });
    })(modalOverlays[m]);
  }

  // 分类相关按钮
  document.getElementById("btn-categories").addEventListener("click", openCategoryManager);
  document.getElementById("btn-add-category").addEventListener("click", function () {
    openCategoryEditor(null);
  });
  document.getElementById("btn-cat-save").addEventListener("click", saveCategory);
  document.getElementById("btn-cat-cancel").addEventListener("click", function () {
    hideModal("modal-category-edit");
  });

  // 颜色选择器
  document.getElementById("cat-color-picker").addEventListener("click", function (e) {
    var dot = e.target.closest(".cog-color-dot");
    if (!dot) return;
    var allDots = document.querySelectorAll("#cat-color-picker .cog-color-dot");
    for (var di = 0; di < allDots.length; di++) {
      allDots[di].classList.remove("selected");
    }
    dot.classList.add("selected");
    document.getElementById("cat-edit-color").value = dot.dataset.color;
  });

  // 条目编辑
  document.getElementById("btn-new").addEventListener("click", newEntry);
  document.getElementById("btn-entry-save").addEventListener("click", saveEntry);
  document.getElementById("btn-entry-cancel").addEventListener("click", function () {
    hideModal("modal-entry-edit");
  });
  document.getElementById("btn-entry-delete").addEventListener("click", deleteEntry);

  // 导入/导出
  document.getElementById("btn-import").addEventListener("click", openImport);
  document.getElementById("btn-export").addEventListener("click", exportJSON);
  document.getElementById("btn-reload").addEventListener("click", function () {
    showConfirm("重新加载将丢弃所有本地修改，确定继续？", reloadFromJSON);
  });

  // 导入区域
  var importZone = document.getElementById("import-zone");
  var fileInput = document.getElementById("file-input");
  importZone.addEventListener("click", function () { fileInput.click(); });
  fileInput.addEventListener("change", function () {
    if (fileInput.files.length > 0) {
      importJSON(fileInput.files[0]);
      fileInput.value = "";
    }
  });

  // 拖拽导入
  importZone.addEventListener("dragover", function (e) {
    e.preventDefault();
    importZone.style.borderColor = "var(--cog-accent)";
  });
  importZone.addEventListener("dragleave", function () {
    importZone.style.borderColor = "";
  });
  importZone.addEventListener("drop", function (e) {
    e.preventDefault();
    importZone.style.borderColor = "";
    var file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".json")) {
      importJSON(file);
    } else {
      showToast("请拖入 JSON 文件", "error");
    }
  });

  // 主题切换
  $themeToggle.addEventListener("click", toggleTheme);

  // 搜索
  $searchInput.addEventListener("input", function () {
    searchQuery = $searchInput.value.trim();
    applyFilters();
    readerIndex = 0;
    renderCurrentView();
  });

  // 分类筛选
  $categoryFilter.addEventListener("change", function () {
    currentCategoryId = $categoryFilter.value;
    applyFilters();
    readerIndex = 0;
    renderCurrentView();
  });

  // 日期筛选
  $dateFrom.addEventListener("change", function () {
    dateFrom = $dateFrom.value;
    applyFilters();
    readerIndex = 0;
    renderCurrentView();
  });
  $dateTo.addEventListener("change", function () {
    dateTo = $dateTo.value;
    applyFilters();
    readerIndex = 0;
    renderCurrentView();
  });

  // 清除筛选
  $btnClearFilters.addEventListener("click", function () {
    currentCategoryId = "";
    dateFrom = "";
    dateTo = "";
    searchQuery = "";
    $searchInput.value = "";
    $categoryFilter.value = "";
    $dateFrom.value = "";
    $dateTo.value = "";
    readerIndex = 0;
    applyFilters();
    renderCurrentView();
  });

  // 阅读模式切换
  document.getElementById("mode-reader").addEventListener("click", function () {
    readingMode = "reader";
    document.getElementById("mode-reader").classList.add("active");
    document.getElementById("mode-browse").classList.remove("active");
    readerIndex = 0;
    renderCurrentView();
  });

  document.getElementById("mode-browse").addEventListener("click", function () {
    readingMode = "browse";
    document.getElementById("mode-browse").classList.add("active");
    document.getElementById("mode-reader").classList.remove("active");
    renderCurrentView();
  });

  // 键盘导航（单篇精读模式）
  document.addEventListener("keydown", function (e) {
    // 弹窗打开时不处理
    var modals = document.querySelectorAll(".cog-modal-overlay");
    for (var i = 0; i < modals.length; i++) {
      if (modals[i].style.display !== "none" && modals[i].style.display !== "") return;
    }

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (readingMode === "reader" && readerIndex > 0) {
        readerIndex--;
        renderCurrentView();
        document.getElementById("content-area").scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (readingMode === "reader" && readerIndex < filteredItems.length - 1) {
        readerIndex++;
        renderCurrentView();
        document.getElementById("content-area").scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  });

  // ===== 启动 =====
  initTheme();
  loadData();
})();
