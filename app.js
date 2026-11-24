(() => {
  "use strict";

  const root = document.documentElement;
  const metaColorScheme = document.querySelector('meta[name="color-scheme"]');
  const mainContent = document.getElementById("main-content");
  const settingsPopover = document.getElementById("reading-settings");
  const settingsTrigger = document.getElementById("settings-trigger");
  const settingsCloseBtn = document.getElementById("settings-close");
  const tocDialog = document.getElementById("toc-dialog");
  const searchDialog = document.getElementById("search-dialog");
  const searchInput = document.getElementById("search-input");
  const searchResults = document.getElementById("search-results");
  const searchCount = document.getElementById("search-count");
  const backToTop = document.getElementById("back-to-top");
  const currentSectionLabel = document.getElementById("current-section-label");
  const tocPercent = document.getElementById("toc-percent");
  const resumeBanner = document.getElementById("resume-banner");
  const resumeTitle = document.getElementById("resume-title");
  const resumeGoBtn = document.getElementById("resume-go");
  const resumeDismissBtn = document.getElementById("resume-dismiss");

  const STORAGE_KEYS = {
    scheme: "color-scheme",
    font: "elon-guide-font",
    size: "elon-guide-size",
    leading: "elon-guide-leading",
    bookmark: "elon-guide-bookmark",
  };

  function safeGet(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function safeSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Storage blocked: still apply in-memory UI state.
    }
  }

  function safeRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore storage errors.
    }
  }

  /* ========================================================================
     1. Conditional Polyfills (Popover API & Invoker Commands)
     ======================================================================== */
  if (!Object.hasOwn(HTMLElement.prototype, "popover")) {
    import("https://unpkg.com/@oddbird/popover-polyfill@latest/dist/popover.min.js").catch(() => {});
  }

  function attachOfflineCommandFallback() {
    document.addEventListener("click", (event) => {
      const btn = event.target.closest("button[commandfor][command]");
      if (!btn) return;
      const targetId = btn.getAttribute("commandfor");
      const command = btn.getAttribute("command");
      const target = document.getElementById(targetId);
      if (!target) return;

      if (command === "toggle-popover") {
        if (typeof target.togglePopover === "function") {
          target.togglePopover();
        } else {
          target.classList.toggle(":popover-open");
        }
      } else if (command === "hide-popover") {
        if (typeof target.hidePopover === "function") {
          target.hidePopover();
        } else {
          target.classList.remove(":popover-open");
        }
      } else if (command === "show-modal" && typeof target.showModal === "function") {
        if (!target.open) target.showModal();
      } else if (command === "close" && typeof target.close === "function") {
        if (target.open) target.close();
      }
    });
  }

  if (!("commandForElement" in HTMLButtonElement.prototype)) {
    import("https://esm.run/invokers-polyfill").catch(() => {
      attachOfflineCommandFallback();
    });
  }

  // Keep aria-expanded synced on the settings popover trigger (also covers invokers-polyfill)
  if (settingsPopover && settingsTrigger) {
    settingsPopover.addEventListener("toggle", (event) => {
      const isOpen = event.newState === "open";
      settingsTrigger.setAttribute("aria-expanded", String(isOpen));
    });
  }

  // Return focus to trigger when hiding popover via internal close button
  if (settingsCloseBtn && settingsTrigger) {
    settingsCloseBtn.addEventListener("click", () => {
      requestAnimationFrame(() => {
        settingsTrigger.focus();
      });
    });
  }

  /* ========================================================================
     2. Light-Dismiss Fallback for <dialog closedby="any"> (Safari)
     ======================================================================== */
  if (!("closedBy" in HTMLDialogElement.prototype)) {
    document.querySelectorAll('dialog[closedby="any"]').forEach((dialog) => {
      dialog.addEventListener("click", (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (isDialogContent) return;
        dialog.close();
      });
    });
  }

  /* ========================================================================
     3. Three-State Color Scheme Control (System / Light / Dark)
     ======================================================================== */
  const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const themeButtons = document.querySelectorAll("[data-theme-choice]");
  const systemStateLabel = document.getElementById("system-theme-status");

  function getStoredScheme() {
    const val = safeGet(STORAGE_KEYS.scheme);
    return val === "light" || val === "dark" ? val : "system";
  }

  function updateSystemStatusText() {
    if (!systemStateLabel) return;
    systemStateLabel.textContent = darkQuery.matches ? "当前：夜间" : "当前：日间";
  }

  function applyColorScheme(choice, persist = true) {
    const valid = choice === "light" || choice === "dark" ? choice : "system";
    if (metaColorScheme) {
      metaColorScheme.content = valid === "system" ? "light dark" : valid;
    }

    if (persist) {
      if (valid === "system") {
        safeRemove(STORAGE_KEYS.scheme);
      } else {
        safeSet(STORAGE_KEYS.scheme, valid);
      }
    }

    themeButtons.forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset.themeChoice === valid));
    });
  }

  updateSystemStatusText();
  applyColorScheme(getStoredScheme(), false);

  themeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      applyColorScheme(btn.dataset.themeChoice, true);
    });
  });

  // Update live OS status text when system preference changes (never clear stored override!)
  darkQuery.addEventListener("change", () => {
    updateSystemStatusText();
  });

  // Stay in sync across tabs
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEYS.scheme) {
      applyColorScheme(getStoredScheme(), false);
    }
  });

  /* ========================================================================
     4. Reading Typography Preferences (Font, Size, Leading)
     ======================================================================== */
  function setupPrefGroup(attrName, storageKey, defaultVal, selector, dataKey) {
    const buttons = document.querySelectorAll(selector);
    const apply = (val, persist = true) => {
      if (val === defaultVal) {
        root.removeAttribute(`data-${attrName}`);
      } else {
        root.setAttribute(`data-${attrName}`, val);
      }
      if (persist) safeSet(storageKey, val);
      buttons.forEach((btn) => {
        btn.setAttribute("aria-pressed", String(btn.dataset[dataKey] === val));
      });
    };

    const initial = safeGet(storageKey) || defaultVal;
    apply(initial, false);

    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        apply(btn.dataset[dataKey], true);
      });
    });
  }

  setupPrefGroup("font", STORAGE_KEYS.font, "sans", "[data-font-choice]", "fontChoice");
  setupPrefGroup("size", STORAGE_KEYS.size, "md", "[data-size-choice]", "sizeChoice");
  setupPrefGroup("leading", STORAGE_KEYS.leading, "normal", "[data-leading-choice]", "leadingChoice");

  /* ========================================================================
     5. Scroll Progress Bar Fallback (only when animation-timeline unsupported)
     ======================================================================== */
  const progressBar = document.getElementById("reading-progress");
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  let scrollTicking = false;
  function updateScrollMetrics() {
    const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const ratio = Math.min(1, Math.max(0, window.scrollY / scrollable));

    if (tocPercent) {
      tocPercent.textContent = `${Math.round(ratio * 100)}%`;
    }

    if (progressBar && !CSS.supports("animation-timeline", "scroll()") && !reducedMotionQuery.matches) {
      progressBar.style.transform = `scaleX(${ratio})`;
    }
    scrollTicking = false;
  }

  window.addEventListener(
    "scroll",
    () => {
      if (!scrollTicking) {
        scrollTicking = true;
        requestAnimationFrame(updateScrollMetrics);
      }
    },
    { passive: true }
  );
  updateScrollMetrics();

  /* ========================================================================
     6. Back-to-Top Scroll-State Fallback + Focus Management
     ======================================================================== */
  const scrollSentinel = document.querySelector(".scroll-sentinel");
  if (!CSS.supports("container-type", "scroll-state") && scrollSentinel) {
    const sentinelObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          root.classList.toggle("scrolled", !entry.isIntersecting);
        });
      },
      { root: null }
    );
    sentinelObserver.observe(scrollSentinel);
  }

  if (backToTop && mainContent) {
    backToTop.addEventListener("click", (event) => {
      event.preventDefault();
      window.scrollTo({
        top: 0,
        behavior: reducedMotionQuery.matches ? "auto" : "smooth",
      });
      mainContent.focus({ preventScroll: true });
    });

    // Recover focus to main scrollable region if hidden while focused (e.g. via PageUp/Home)
    backToTop.addEventListener("focusout", (event) => {
      if (event.relatedTarget) return;
      requestAnimationFrame(() => {
        if (getComputedStyle(backToTop).visibility === "hidden") {
          mainContent.focus({ preventScroll: true });
        }
      });
    });
  }

  /* ========================================================================
     7. Active TOC Scrollspy & Last-Read Bookmark
     ======================================================================== */
  const trackedHeadings = Array.from(document.querySelectorAll("[data-toc-id]"));
  const tocLinks = Array.from(document.querySelectorAll(".toc-link[data-target]"));
  const headingTitleMap = new Map(
    trackedHeadings.map((el) => [el.id, el.dataset.tocTitle || el.textContent.trim()])
  );

  let activeId = "";
  let bookmarkTimer = null;

  function setActiveToc(id) {
    if (!id || id === activeId) return;
    activeId = id;

    tocLinks.forEach((link) => {
      const match = link.dataset.target === id;
      link.classList.toggle("is-active", match);
      if (match) {
        link.setAttribute("aria-current", "location");
      } else {
        link.removeAttribute("aria-current");
      }
    });

    const title = headingTitleMap.get(id);
    if (currentSectionLabel && title) {
      currentSectionLabel.textContent = title;
    }

    // Debounce bookmark persistence when reader has scrolled into chapters
    if (window.scrollY > 520) {
      clearTimeout(bookmarkTimer);
      bookmarkTimer = setTimeout(() => {
        safeSet(STORAGE_KEYS.bookmark, JSON.stringify({ id, title }));
      }, 600);
    }
  }

  if (trackedHeadings.length > 0) {
    const headingObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveToc(visible[0].target.id);
        }
      },
      {
        rootMargin: "-68px 0px -68% 0px",
        threshold: 0,
      }
    );
    trackedHeadings.forEach((h) => headingObserver.observe(h));
  }

  // Close mobile TOC dialog when selecting a section
  if (tocDialog) {
    tocDialog.addEventListener("click", (event) => {
      const link = event.target.closest("a.toc-link");
      if (link) {
        tocDialog.close();
      }
    });
  }

  // Show resume reading banner if a previous chapter bookmark exists
  const savedBookmarkRaw = safeGet(STORAGE_KEYS.bookmark);
  if (savedBookmarkRaw && resumeBanner && resumeTitle && resumeGoBtn) {
    try {
      const saved = JSON.parse(savedBookmarkRaw);
      if (saved && saved.id && saved.title && document.getElementById(saved.id)) {
        resumeTitle.textContent = saved.title;
        resumeGoBtn.setAttribute("href", `#${saved.id}`);
        resumeBanner.hidden = false;
      }
    } catch {
      // Ignore malformed bookmark
    }
  }

  if (resumeDismissBtn && resumeBanner) {
    resumeDismissBtn.addEventListener("click", () => {
      resumeBanner.hidden = true;
      safeRemove(STORAGE_KEYS.bookmark);
    });
  }

  /* ========================================================================
     8. Full-Text Instant Search inside <dialog id="search-dialog">
     ======================================================================== */
  const paragraphs = Array.from(document.querySelectorAll(".article-body p[id]")).map((p) => ({
    id: p.id,
    text: p.textContent.trim(),
    lower: p.textContent.trim().toLowerCase(),
    section: p.dataset.sectionTitle || "全文",
    el: p,
  }));

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderSearchEmpty(message, showSuggestions = true) {
    if (!searchResults || !searchCount) return;
    searchCount.textContent = message;
    const chips = ["第一性原理", "猎鹰一号", "特斯拉", "OpenAI", "推特", "星链", "PayPal", "艾萨克森"];
    const suggestionHtml = showSuggestions
      ? `<div class="search-suggestions">${chips
          .map((kw) => `<button type="button" class="suggestion-chip" data-suggest="${kw}">${kw}</button>`)
          .join("")}</div>`
      : "";
    searchResults.innerHTML = `<li class="search-empty">${escapeHtml(message)}${suggestionHtml}</li>`;
  }

  function runSearch(rawQuery) {
    if (!searchResults || !searchCount) return;
    const query = rawQuery.trim();
    if (!query) {
      renderSearchEmpty("输入关键词检索全书 5.4 万字导读内容", true);
      return;
    }

    const qLower = query.toLowerCase();
    const matches = [];
    for (let i = 0; i < paragraphs.length; i++) {
      const idx = paragraphs[i].lower.indexOf(qLower);
      if (idx !== -1) {
        matches.push({ item: paragraphs[i], idx });
        if (matches.length >= 40) break;
      }
    }

    if (matches.length === 0) {
      renderSearchEmpty(`未找到包含「${query}」的段落`, true);
      return;
    }

    const suffix = matches.length === 40 ? "（仅展示前 40 条）" : "";
    searchCount.textContent = `找到 ${matches.length} 处相关段落${suffix}`;

    searchResults.innerHTML = matches
      .map(({ item, idx }) => {
        const start = Math.max(0, idx - 34);
        const end = Math.min(item.text.length, idx + query.length + 78);
        const prefix = start > 0 ? "…" : "";
        const postfix = end < item.text.length ? "…" : "";
        const before = escapeHtml(item.text.slice(start, idx));
        const hit = escapeHtml(item.text.slice(idx, idx + query.length));
        const after = escapeHtml(item.text.slice(idx + query.length, end));
        return `
          <li>
            <button type="button" class="search-result-btn" data-jump-id="${item.id}">
              <span class="search-result-loc">${escapeHtml(item.section)}</span>
              <span class="search-result-snippet">${prefix}${before}<mark>${hit}</mark>${after}${postfix}</span>
            </button>
          </li>`;
      })
      .join("");
  }

  let flashTimer = null;
  function jumpToParagraph(id) {
    const target = document.getElementById(id);
    if (!target) return;
    if (searchDialog && searchDialog.open) searchDialog.close();

    target.scrollIntoView({
      behavior: reducedMotionQuery.matches ? "auto" : "smooth",
      block: "center",
    });

    document.querySelectorAll(".search-hit-flash").forEach((el) => el.classList.remove("search-hit-flash"));
    target.classList.add("search-hit-flash");
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      target.classList.remove("search-hit-flash");
    }, 2400);
  }

  if (searchInput && searchResults) {
    renderSearchEmpty("输入关键词检索全书 5.4 万字导读内容", true);

    searchInput.addEventListener("input", () => {
      runSearch(searchInput.value);
    });

    // If search box has text when Esc is pressed, clear input first instead of closing dialog
    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && searchInput.value.trim() !== "") {
        event.preventDefault();
        event.stopPropagation();
        searchInput.value = "";
        runSearch("");
      }
    });

    searchResults.addEventListener("click", (event) => {
      const jumpBtn = event.target.closest("[data-jump-id]");
      if (jumpBtn) {
        jumpToParagraph(jumpBtn.dataset.jumpId);
        return;
      }
      const chip = event.target.closest("[data-suggest]");
      if (chip) {
        searchInput.value = chip.dataset.suggest;
        runSearch(searchInput.value);
        searchInput.focus();
      }
    });
  }

  // Focus search input whenever search dialog opens
  if (searchDialog && searchInput) {
    const focusSearchOnOpen = () => {
      if (searchDialog.open) {
        requestAnimationFrame(() => searchInput.focus());
      }
    };
    const dialogAttrObserver = new MutationObserver(focusSearchOnOpen);
    dialogAttrObserver.observe(searchDialog, { attributes: true, attributeFilter: ["open"] });

    // Global shortcut: "/" or Cmd/Ctrl + K opens search dialog
    document.addEventListener("keydown", (event) => {
      const tag = document.activeElement?.tagName;
      const isEditing = tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (!searchDialog.open) searchDialog.showModal();
        searchInput.focus();
      } else if (event.key === "/" && !isEditing && !searchDialog.open && !tocDialog?.open) {
        event.preventDefault();
        searchDialog.showModal();
        searchInput.focus();
      }
    });
  }
})();
