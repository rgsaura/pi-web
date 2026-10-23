/* Variaciones interactivas v2 (enc-3767cbf2) — comportamiento compartido.
   Cero dependencias externas. El cromo (barra superior + lateral) se inyecta
   desde aquí para que todas las pantallas usen literalmente el mismo. */
(function () {
  "use strict";

  // — Temas reales de la app (mismos nombres que hooks/useTheme.ts) —
  var THEMES = ["auto", "dark", "light", "mist", "rose", "pine"];
  var THEME_LABELS = { auto: "Auto", dark: "Oscuro", light: "Claro", mist: "Mist", rose: "Rose", pine: "Pine" };
  var STORAGE_KEY = "variaciones-v2-theme";

  function isDark(theme) {
    return theme === "dark" || theme === "pine";
  }

  function resolveTheme(pref) {
    if (pref === "auto") {
      return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
    return pref;
  }

  function applyTheme(pref) {
    var resolved = resolveTheme(pref);
    document.documentElement.dataset.theme = resolved;
    document.documentElement.classList.toggle("dark", isDark(resolved));
  }

  function loadTheme() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw && THEMES.indexOf(raw) >= 0) return raw;
    } catch (e) { /* storage no disponible */ }
    return "auto";
  }

  // — Conmutador A/B/C —
  function variantFromUrl() {
    var m = /[?&]v=([ABC])\b/i.exec(window.location.search);
    if (m) return m[1].toUpperCase();
    var h = /^#([ABC])$/.exec(window.location.hash);
    return h ? h[1].toUpperCase() : null;
  }

  function setUrlVariant(v) {
    try {
      var url = new URL(window.location.href);
      url.searchParams.set("v", v);
      history.replaceState(null, "", url.toString());
    } catch (e) { /* file:// sin history */ }
  }

  function selectVariant(root, v) {
    var buttons = root.querySelectorAll(".switcher button[data-variant]");
    var variants = root.querySelectorAll(".variant[data-variant]");
    Array.prototype.forEach.call(buttons, function (b) {
      b.setAttribute("aria-selected", b.dataset.variant === v ? "true" : "false");
    });
    Array.prototype.forEach.call(variants, function (el) {
      el.classList.toggle("active", el.dataset.variant === v);
    });
    setUrlVariant(v);
  }

  function initSwitchers() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-switcher]"), function (root) {
      var v = variantFromUrl() || root.dataset.defaultVariant || "A";
      root.addEventListener("click", function (e) {
        var btn = e.target.closest(".switcher button[data-variant]");
        if (btn && root.contains(btn)) selectVariant(root, btn.dataset.variant);
      });
      selectVariant(root, v);
    });
    document.addEventListener("keydown", function (e) {
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      var k = e.key.toUpperCase();
      if (k === "A" || k === "B" || k === "C") {
        Array.prototype.forEach.call(document.querySelectorAll("[data-switcher]"), function (root) {
          selectVariant(root, k);
        });
      }
    });
  }

  // — Cromo de la app: barra superior + lateral con las secciones EXO reales —
  function topbarHtml() {
    return (
      '<header class="topbar">' +
      '<div class="topbar-brand">Exohuman UI</div>' +
      '<div class="topbar-actions">' +
      '<span class="topbar-action">＋</span>' +
      '<span class="topbar-action">Full history</span>' +
      '<span class="topbar-action">Generate title</span>' +
      '<span class="topbar-action">System</span>' +
      '<span class="topbar-action">Tools</span>' +
      "</div>" +
      '<div class="topbar-spacer"></div>' +
      '<span class="topbar-icon-btn">◧</span>' +
      "</header>"
    );
  }

  function sidebarHtml() {
    return (
      '<aside class="app-sidebar">' +
      '<div class="exo-nav">' +
      '<button class="exo-nav-btn"><span class="lbl">⚡ Actividad</span><span class="exo-nav-live"><span class="dot"></span>en vivo</span></button>' +
      '<button class="exo-nav-btn"><span class="lbl">🗓️ Línea de tiempo</span><span class="meta">pasado → próximo</span></button>' +
      '<button class="exo-nav-btn"><span class="lbl">📊 Paneles</span><span class="meta">entregables</span></button>' +
      '<button class="exo-nav-btn"><span class="lbl">🎬 Post Studio</span><span class="exo-nav-pill-pre">pre</span></button>' +
      '<button class="exo-nav-btn"><span class="lbl">🤖 Agentes</span><span class="meta">prompts · skills</span></button>' +
      '<button class="exo-nav-btn"><span class="lbl">Workspaces</span><span class="exo-nav-count">5</span></button>' +
      '<button class="exo-nav-btn"><span class="lbl">✏️ Encargos</span><span class="exo-nav-count is-amber">2</span></button>' +
      '<button class="exo-nav-btn"><span class="lbl">💬 Decisiones</span><span class="exo-nav-count is-red">15</span></button>' +
      '<button class="exo-nav-btn is-voice"><span class="lbl">🎙 Hablar por Voz</span><span class="exo-nav-pill-pre" style="background:rgba(52,211,153,0.2);color:#34d399">ROT Live</span></button>' +
      "</div>" +
      '<div class="exo-sidebar-sep"></div>' +
      '<div class="exo-project-row"><span class="chev">›</span> enc-b9034e06</div>' +
      '<div class="exo-project-row"><span class="chev">›</span> general</div>' +
      '<div class="exo-project-row"><span class="chev">›</span> Rutina: call-intake</div>' +
      '<div class="exo-project-row"><span class="chev">›</span> app</div>' +
      '<div class="exo-sidebar-sep"></div>' +
      '<div class="exo-files-head">⌄ FILES</div>' +
      '<div class="exo-file-row"><span class="fico">⌗</span> ~/workspaces/exohuman</div>' +
      '<div class="exo-file-row"><span class="fico">▸</span> .worktrees</div>' +
      '<div class="exo-file-row"><span class="fico">▸</span> core</div>' +
      '<div class="exo-file-row"><span class="fico">▸</span> ui</div>' +
      '<div class="exo-file-row"><span class="fico">▸</span> ui-prod</div>' +
      "</aside>"
    );
  }

  function mobilebarHtml() {
    return (
      '<header class="mobilebar">' +
      "<button>☰</button>" +
      "<button>···</button>" +
      '<div class="mobilebar-title">Session info</div>' +
      '<button>◧</button>' +
      "</header>"
    );
  }

  // inyecta el cromo: <div data-chrome="desktop|mobile">…</div>
  function initChrome() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-chrome]"), function (el) {
      var kind = el.getAttribute("data-chrome");
      if (kind === "mobile") {
        el.outerHTML = '<div class="phone"><div class="phone-screen">' + mobilebarHtml() + '<div class="phone-body">' + el.innerHTML + "</div></div></div>";
      } else {
        // la app real: barra superior + split lateral/zona principal
        el.outerHTML = topbarHtml() + '<div class="app-split">' + sidebarHtml() + '<main class="app-main">' + el.innerHTML + "</main></div>";
      }
    });
  }

  // — Tema: inyecta el selector en [data-theme-switch] —
  function initThemeSwitch() {
    var pref = loadTheme();
    Array.prototype.forEach.call(document.querySelectorAll("[data-theme-switch]"), function (host) {
      var wrap = document.createElement("div");
      wrap.className = "theme-switch";
      wrap.setAttribute("role", "group");
      wrap.setAttribute("aria-label", "Tema (temas reales de la app)");
      THEMES.forEach(function (t) {
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = THEME_LABELS[t];
        b.setAttribute("aria-pressed", t === pref ? "true" : "false");
        b.addEventListener("click", function () {
          pref = t;
          try { localStorage.setItem(STORAGE_KEY, t); } catch (e) { /* ignore */ }
          applyTheme(t);
          Array.prototype.forEach.call(wrap.querySelectorAll("button"), function (x, i) {
            x.setAttribute("aria-pressed", THEMES[i] === t ? "true" : "false");
          });
        });
        wrap.appendChild(b);
      });
      host.appendChild(wrap);
    });
    applyTheme(pref);
  }

  document.addEventListener("DOMContentLoaded", function () {
    initChrome();
    initThemeSwitch();
    initSwitchers();
  });
})();
