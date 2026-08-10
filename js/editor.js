(function () {
  "use strict";

  // ===== localStorage key =====
  var STORAGE_KEY = "diary_editor_entries";
  var DELETED_KEY = "diary_editor_deleted";

  // ===== 状态 =====
  var entries = [];
  var deletedIds = [];
  var currentEntryId = null;
  var currentTags = [];
  var isDirty = false;
  var autoSaveTimer = null;
  var previewTimer = null;

  // ===== DOM 引用 =====
  var $sidebarList = document.getElementById("sidebar-list");
  var $sidebarSearch = document.getElementById("sidebar-search-input");
  var $editorEmpty = document.getElementById("editor-empty");
  var $editorForm = document.getElementById("editor-form");
  var $editorLayout = document.getElementById("editor-layout");
  var $entryDate = document.getElementById("entry-date");
  var $entryMood = document.getElementById("entry-mood");
  var $entryTitle = document.getElementById("entry-title");
  var $entryContent = document.getElementById("entry-content");
  var $tagChips = document.getElementById("tag-chips");
  var $tagAddInput = document.getElementById("tag-add-input");
  var $previewContent = document.getElementById("preview-content");
  var $saveIndicator = document.getElementById("save-indicator");
  var $entryIdLabel = document.getElementById("entry-id-label");
  var $entryCount = document.getElementById("entry-count");
  var $fileInputJson = document.getElementById("file-input-json");
  var $fileInputMd = document.getElementById("file-input-md");
  var $mobilePaneTabs = document.getElementById("mobile-pane-tabs");
  var $toastContainer = document.getElementById("toast-container");

  // ===== Markdown 渲染（与 main.js 一致） =====
  function renderMarkdown(text) {
    if (!text) return "";
    try {
      if (typeof marked !== "undefined") {
        if (typeof marked.parse === "function") {
          return marked.parse(text);
        } else if (typeof marked === "function") {
          return marked(text);
        }
      }
    } catch (e) {
      console.warn("Markdown 渲染失败:", e);
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
    return d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日";
  }

  function generateId() {
    var now = new Date();
    var yyyy = now.getFullYear();
    var mm = String(now.getMonth() + 1).padStart(2, "0");
    var dd = String(now.getDate()).padStart(2, "0");
    var rand = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0");
    return yyyy + "-" + mm + "-" + dd + "-" + rand;
  }

  function todayStr() {
    var now = new Date();
    return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
  }

  // ===== Toast =====
  function showToast(message, type) {
    type = type || "info";
    var toast = document.createElement("div");
    toast.className = "toast toast-" + type;
    toast.textContent = message;
    $toastContainer.appendChild(toast);
    setTimeout(function () {
      toast.classList.add("toast-fade-out");
      toast.addEventListener("animationend", function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      });
    }, 2500);
  }

  // ===== 确认对话框 =====
  function showConfirm(message, callback) {
    var overlay = document.createElement("div");
    overlay.className = "confirm-overlay";
    overlay.innerHTML =
      '<div class="confirm-dialog">' +
      "<p>" + escapeHtml(message) + "</p>" +
      '<div class="confirm-dialog-actions">' +
      '<button class="toolbar-btn" id="confirm-cancel">取消</button>' +
      '<button class="toolbar-btn toolbar-btn-danger" id="confirm-ok">确定删除</button>' +
      "</div>" +
      "</div>";
    document.body.appendChild(overlay);

    overlay.querySelector("#confirm-cancel").addEventListener("click", function () {
      document.body.removeChild(overlay);
      if (callback) callback(false);
    });

    overlay.querySelector("#confirm-ok").addEventListener("click", function () {
      document.body.removeChild(overlay);
      if (callback) callback(true);
    });

    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
        if (callback) callback(false);
      }
    });
  }

  // ===== 数据加载与持久化 =====
  function loadEntries(callback) {
    fetch("data/entries.json")
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (data) {
        var fileEntries = [];
        if (data.entries && Array.isArray(data.entries)) {
          data.entries.forEach(function (entry) {
            if (entry.id && entry.date) {
              fileEntries.push(normalizeEntry(entry));
            }
          });
        }

        // 加载 localStorage 中的工作副本
        var storedJson = localStorage.getItem(STORAGE_KEY);
        var storedEntries = storedJson ? JSON.parse(storedJson) : null;
        var deletedJson = localStorage.getItem(DELETED_KEY);
        deletedIds = deletedJson ? JSON.parse(deletedJson) : [];

        if (storedEntries && Array.isArray(storedEntries) && storedEntries.length > 0) {
          // 合并：localStorage 条目覆盖同名 id 的文件条目
          var storedMap = {};
          storedEntries.forEach(function (e) {
            storedMap[e.id] = e;
          });

          // 文件中有但 localStorage 中没有的 → 新增的（用户手动编辑了 JSON）
          fileEntries.forEach(function (fe) {
            if (!storedMap[fe.id]) {
              storedMap[fe.id] = fe;
            }
          });

          // 转为数组并排序
          entries = Object.values(storedMap);
        } else {
          entries = fileEntries;
          // 初始化 localStorage
          saveEntriesToStorage();
        }

        // 排序：按日期倒序
        entries.sort(function (a, b) {
          if (a.date < b.date) return 1;
          if (a.date > b.date) return -1;
          return 0;
        });

        // 过滤已删除的
        entries = entries.filter(function (e) {
          return deletedIds.indexOf(e.id) === -1;
        });

        renderSidebar();
        if (callback) callback();
      })
      .catch(function (err) {
        console.error("加载日记数据失败:", err);
        // 尝试从 localStorage 回退
        var storedJson = localStorage.getItem(STORAGE_KEY);
        if (storedJson) {
          entries = JSON.parse(storedJson);
          entries.sort(function (a, b) {
            if (a.date < b.date) return 1;
            if (a.date > b.date) return -1;
            return 0;
          });
          renderSidebar();
          showToast("无法加载数据文件，已使用本地缓存", "error");
        } else {
          $sidebarList.innerHTML = '<div class="sidebar-empty">加载失败，请确认通过 HTTP 服务打开此页面</div>';
        }
        if (callback) callback();
      });
  }

  function normalizeEntry(raw) {
    return {
      id: raw.id || "",
      date: raw.date || "",
      title: raw.title || "",
      content: raw.content || "",
      mood: raw.mood || "",
      tags: raw.tags || [],
    };
  }

  function saveEntriesToStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    localStorage.setItem(DELETED_KEY, JSON.stringify(deletedIds));
  }

  function reloadFromFile() {
    showConfirm("从 entries.json 重新加载将丢弃所有本地修改。确定继续？", function (confirmed) {
      if (!confirmed) return;
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(DELETED_KEY);
      deletedIds = [];
      currentEntryId = null;
      currentTags = [];
      loadEntries(function () {
        showEditorEmpty();
        showToast("已从文件重新加载", "success");
      });
    });
  }

  // ===== 侧边栏渲染 =====
  function renderSidebar(filterText) {
    var filtered = entries;
    if (filterText && filterText.trim()) {
      var q = filterText.trim().toLowerCase();
      filtered = entries.filter(function (entry) {
        return (
          (entry.title && entry.title.toLowerCase().indexOf(q) > -1) ||
          (entry.content && entry.content.toLowerCase().indexOf(q) > -1) ||
          (entry.date && entry.date.indexOf(q) > -1) ||
          entry.tags.some(function (tag) {
            return tag.toLowerCase().indexOf(q) > -1;
          })
        );
      });
    }

    if (filtered.length === 0) {
      $sidebarList.innerHTML = '<div class="sidebar-empty">' + (filterText ? "无匹配条目" : "暂无日记，点击「新建日记」开始") + "</div>";
    } else {
      var html = "";
      filtered.forEach(function (entry) {
        var isActive = currentEntryId === entry.id;
        var title = entry.title || formatDate(entry.date);
        html +=
          '<div class="sidebar-item' +
          (isActive ? " active" : "") +
          '" data-id="' +
          escapeHtml(entry.id) +
          '">' +
          '<span class="sidebar-item-date">' +
          escapeHtml(entry.date) +
          "</span>" +
          '<span class="sidebar-item-title">' +
          escapeHtml(title) +
          "</span>" +
          '<span class="sidebar-item-mood">' +
          moodEmoji(entry.mood) +
          "</span>" +
          "</div>";
      });
      $sidebarList.innerHTML = html;
    }

    $entryCount.textContent = entries.length + " 条日记";
  }

  // ===== 编辑器表单 =====
  function showEditorEmpty() {
    $editorEmpty.style.display = "flex";
    $editorForm.style.display = "none";
    currentEntryId = null;
    currentTags = [];
  }

  function selectEntry(id) {
    var entry = null;
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].id === id) {
        entry = entries[i];
        break;
      }
    }
    if (!entry) {
      showEditorEmpty();
      return;
    }

    currentEntryId = id;
    currentTags = entry.tags ? entry.tags.slice() : [];
    isDirty = false;

    $editorEmpty.style.display = "none";
    $editorForm.style.display = "flex";
    $entryDate.value = entry.date;
    $entryMood.value = entry.mood || "";
    $entryTitle.value = entry.title || "";
    $entryContent.value = entry.content || "";
    $entryIdLabel.textContent = "ID: " + entry.id;
    renderTagChips();
    updatePreview();
    updateSaveIndicator("saved");
    renderSidebar($sidebarSearch.value);
  }

  function createNewEntry() {
    var id = generateId();
    var entry = {
      id: id,
      date: todayStr(),
      title: "",
      content: "",
      mood: "",
      tags: [],
    };
    entries.unshift(entry);
    saveEntriesToStorage();
    renderSidebar($sidebarSearch.value);
    selectEntry(id);
    showToast("已创建新日记", "success");
  }

  function updateCurrentEntry() {
    if (!currentEntryId) return;
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].id === currentEntryId) {
        entries[i].date = $entryDate.value;
        entries[i].mood = $entryMood.value;
        entries[i].title = $entryTitle.value.trim();
        entries[i].content = $entryContent.value;
        entries[i].tags = currentTags.slice();
        break;
      }
    }
  }

  function deleteCurrentEntry() {
    if (!currentEntryId) return;
    var entryTitle = $entryTitle.value.trim() || currentEntryId;
    showConfirm("确定要删除日记「" + entryTitle + "」吗？此操作不可恢复。", function (confirmed) {
      if (!confirmed) return;
      deletedIds.push(currentEntryId);
      entries = entries.filter(function (e) {
        return e.id !== currentEntryId;
      });
      saveEntriesToStorage();
      currentEntryId = null;
      currentTags = [];
      showEditorEmpty();
      renderSidebar($sidebarSearch.value);
      showToast("日记已删除", "info");
    });
  }

  function autoSave() {
    if (!currentEntryId) return;
    updateCurrentEntry();
    saveEntriesToStorage();
    isDirty = false;
    updateSaveIndicator("saved");
    // 更新侧边栏（标题可能变了）
    renderSidebar($sidebarSearch.value);
  }

  function markDirty() {
    if (!isDirty) {
      isDirty = true;
      updateSaveIndicator("unsaved");
    }
    // 延迟自动保存
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(autoSave, 600);
  }

  function updateSaveIndicator(state) {
    $saveIndicator.classList.remove("saving", "saved", "unsaved");
    if (state === "saving") {
      $saveIndicator.textContent = "保存中...";
      $saveIndicator.classList.add("saving");
    } else if (state === "saved") {
      $saveIndicator.textContent = "已保存";
      $saveIndicator.classList.add("saved");
    } else if (state === "unsaved") {
      $saveIndicator.textContent = "未保存";
      $saveIndicator.classList.add("unsaved");
    }
  }

  // ===== 标签管理 =====
  function renderTagChips() {
    $tagChips.innerHTML = "";
    currentTags.forEach(function (tag, index) {
      var chip = document.createElement("span");
      chip.className = "tag-chip-editor";
      chip.innerHTML = escapeHtml(tag) + '<span class="tag-chip-remove" data-index="' + index + '">×</span>';
      chip.querySelector(".tag-chip-remove").addEventListener("click", function (e) {
        e.stopPropagation();
        removeTag(index);
      });
      $tagChips.appendChild(chip);
    });
  }

  function addTag(tag) {
    tag = tag.trim();
    if (!tag) return;
    if (currentTags.indexOf(tag) > -1) return;
    currentTags.push(tag);
    renderTagChips();
    markDirty();
  }

  function removeTag(index) {
    currentTags.splice(index, 1);
    renderTagChips();
    markDirty();
  }

  // ===== 预览 =====
  function updatePreview() {
    $previewContent.innerHTML = renderMarkdown($entryContent.value);
  }

  function debouncedPreview() {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(updatePreview, 200);
  }

  // ===== 导入导出 =====
  function exportJson() {
    // 先保存当前编辑
    if (currentEntryId) {
      updateCurrentEntry();
      saveEntriesToStorage();
    }

    var exportData = { entries: entries };
    var json = JSON.stringify(exportData, null, 2);
    var blob = new Blob([json], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "entries.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("已导出 " + entries.length + " 条日记", "success");
  }

  function exportMarkdown() {
    if (!currentEntryId) {
      showToast("请先选择一篇日记", "error");
      return;
    }
    updateCurrentEntry();
    saveEntriesToStorage();

    var entry = null;
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].id === currentEntryId) {
        entry = entries[i];
        break;
      }
    }
    if (!entry) return;

    var md = "";
    md += "---\n";
    md += "date: " + entry.date + "\n";
    if (entry.title) md += "title: " + entry.title + "\n";
    if (entry.mood) md += "mood: " + entry.mood + "\n";
    if (entry.tags && entry.tags.length > 0) {
      md += "tags: [" + entry.tags.join(", ") + "]\n";
    }
    md += "---\n\n";
    md += entry.content || "";

    var blob = new Blob([md], { type: "text/markdown" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = entry.id + ".md";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("已导出 Markdown", "success");
  }

  function importJson(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = JSON.parse(e.target.result);
        if (!data.entries || !Array.isArray(data.entries)) {
          showToast("无效的 JSON 格式：需要包含 entries 数组", "error");
          return;
        }

        var added = 0;
        var updated = 0;
        var entryMap = {};
        entries.forEach(function (e) {
          entryMap[e.id] = e;
        });

        data.entries.forEach(function (raw) {
          if (!raw.id || !raw.date) return;
          var entry = normalizeEntry(raw);
          if (entryMap[entry.id]) {
            updated++;
          } else {
            added++;
          }
          entryMap[entry.id] = entry;
        });

        entries = Object.values(entryMap);
        entries.sort(function (a, b) {
          if (a.date < b.date) return 1;
          if (a.date > b.date) return -1;
          return 0;
        });

        // 移除已删除的
        entries = entries.filter(function (e) {
          return deletedIds.indexOf(e.id) === -1;
        });

        saveEntriesToStorage();
        renderSidebar($sidebarSearch.value);

        var msg = "导入完成：新增 " + added + " 条，更新 " + updated + " 条";
        showToast(msg, "success");
      } catch (err) {
        showToast("JSON 解析失败：" + err.message, "error");
      }
    };
    reader.readAsText(file);
  }

  function importMarkdown(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var text = e.target.result;
      var parsed = parseFrontmatter(text);
      var meta = parsed.meta;

      var entry = {
        id: generateId(),
        date: meta.date || todayStr(),
        title: meta.title || file.name.replace(/\.(md|markdown|txt)$/i, ""),
        content: parsed.content,
        mood: meta.mood || "",
        tags: meta.tags || [],
      };

      // 如果 tags 是逗号分隔的字符串，转为数组
      if (typeof entry.tags === "string") {
        entry.tags = entry.tags.split(",").map(function (s) {
          return s.trim();
        });
      }

      entries.unshift(entry);
      saveEntriesToStorage();
      renderSidebar($sidebarSearch.value);
      selectEntry(entry.id);
      showToast("已从 Markdown 导入新日记", "success");
    };
    reader.readAsText(file);
  }

  function parseFrontmatter(text) {
    var match = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)/);
    if (!match) return { meta: {}, content: text.trim() };

    var meta = {};
    var lines = match[1].split("\n");
    lines.forEach(function (line) {
      var colonIdx = line.indexOf(":");
      if (colonIdx > -1) {
        var key = line.substring(0, colonIdx).trim();
        var val = line.substring(colonIdx + 1).trim();
        // 处理数组: [tag1, tag2]
        if (val.indexOf("[") === 0 && val.lastIndexOf("]") === val.length - 1) {
          val = val
            .slice(1, -1)
            .split(",")
            .map(function (s) {
              return s.trim().replace(/['"]/g, "");
            })
            .filter(Boolean);
        }
        meta[key] = val;
      }
    });
    return { meta: meta, content: match[2].trim() };
  }

  // ===== 事件绑定 =====

  // 侧边栏点击
  $sidebarList.addEventListener("click", function (e) {
    var item = e.target.closest(".sidebar-item");
    if (item && item.dataset.id) {
      selectEntry(item.dataset.id);
    }
  });

  // 侧边栏搜索
  $sidebarSearch.addEventListener("input", function () {
    renderSidebar($sidebarSearch.value);
  });

  // 元数据字段变更
  $entryDate.addEventListener("input", markDirty);
  $entryMood.addEventListener("change", markDirty);
  $entryTitle.addEventListener("input", markDirty);

  // 内容编辑
  $entryContent.addEventListener("input", function () {
    markDirty();
    debouncedPreview();
  });

  // 标签输入
  $tagAddInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag($tagAddInput.value.replace(/,/g, ""));
      $tagAddInput.value = "";
    }
    // Backspace 在空输入时删除最后一个标签
    if (e.key === "Backspace" && !$tagAddInput.value && currentTags.length > 0) {
      removeTag(currentTags.length - 1);
    }
  });

  // Tab 键在文本框中插入空格
  $entryContent.addEventListener("keydown", function (e) {
    if (e.key === "Tab") {
      e.preventDefault();
      var start = $entryContent.selectionStart;
      var end = $entryContent.selectionEnd;
      var before = $entryContent.value.substring(0, start);
      var after = $entryContent.value.substring(end);
      $entryContent.value = before + "  " + after;
      $entryContent.selectionStart = $entryContent.selectionEnd = start + 2;
      markDirty();
      debouncedPreview();
    }
  });

  // 顶部按钮
  document.getElementById("btn-new").addEventListener("click", createNewEntry);
  document.getElementById("btn-new-empty").addEventListener("click", createNewEntry);

  document.getElementById("btn-export-json").addEventListener("click", exportJson);
  document.getElementById("btn-export-md").addEventListener("click", exportMarkdown);
  document.getElementById("btn-delete").addEventListener("click", deleteCurrentEntry);
  document.getElementById("btn-reload").addEventListener("click", reloadFromFile);

  // 导入按钮 → 触发隐藏的 file input
  document.getElementById("btn-import-json").addEventListener("click", function () {
    $fileInputJson.click();
  });
  $fileInputJson.addEventListener("change", function () {
    if ($fileInputJson.files && $fileInputJson.files[0]) {
      importJson($fileInputJson.files[0]);
      $fileInputJson.value = "";
    }
  });

  document.getElementById("btn-import-md").addEventListener("click", function () {
    $fileInputMd.click();
  });
  $fileInputMd.addEventListener("change", function () {
    if ($fileInputMd.files && $fileInputMd.files[0]) {
      importMarkdown($fileInputMd.files[0]);
      $fileInputMd.value = "";
    }
  });

  // 移动端编辑/预览切换
  $mobilePaneTabs.addEventListener("click", function (e) {
    var tab = e.target.closest(".pane-tab");
    if (!tab) return;
    var pane = tab.dataset.pane;
    $mobilePaneTabs.querySelectorAll(".pane-tab").forEach(function (t) {
      t.classList.remove("active");
    });
    tab.classList.add("active");
    if (pane === "preview") {
      updatePreview();
      $editorLayout.classList.add("show-preview");
    } else {
      $editorLayout.classList.remove("show-preview");
    }
  });

  // 窗口大小变化时重置移动端状态
  window.addEventListener("resize", function () {
    if (window.innerWidth > 860) {
      $editorLayout.classList.remove("show-preview");
    }
  });

  // 离开页面前自动保存
  window.addEventListener("beforeunload", function () {
    if (currentEntryId && isDirty) {
      updateCurrentEntry();
      saveEntriesToStorage();
    }
  });

  // ===== 启动 =====
  loadEntries(function () {
    // 默认显示空状态，等待用户选择或新建
    showEditorEmpty();
  });
})();
