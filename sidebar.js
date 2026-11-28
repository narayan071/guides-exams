(function () {
  const GUIDES = [
    {
      href: 'index.html',
      title: 'All Guides',
      subtitle: 'Overview & quick links',
    },
    {
      href: 'Financial Awareness Gap Guide.html',
      title: 'Financial Awareness (PYQ)',
      subtitle: 'IBPS RRB GBO Scale II · PYQ Gap Guide',
    },
    {
      href: 'financial_awareness_guide.html',
      title: 'Financial Awareness Master',
      subtitle: 'IBPS RRB Scale 2 (IT) · Master Guide',
    },
    {
      href: 'computer_knowledge_guide.html',
      title: 'Computer Knowledge',
      subtitle: 'IBPS RRB Scale 2 (IT) · Master Guide',
    },
    {
      href: 'pk_linux_unix_bash.html',
      title: 'PK - Linux, UNIX & Bash',
      subtitle: 'IBPS RRB SO IT Scale 2 · Prof. Knowledge',
      group: 'Professional Knowledge (IT)',
    },
    {
      href: 'pk_computer_organization_architecture.html',
      title: 'PK - Computer Org & Arch',
      subtitle: 'IBPS RRB SO IT Scale 2 · Prof. Knowledge',
      group: 'Professional Knowledge (IT)',
    },
  ];

  const THEME_KEY = 'site_theme';
  const SCALE_KEY = 'site_scale';
  const SIDEBAR_COLLAPSED_KEY = 'site_sidebar_collapsed';
  const SCALE_STEPS = [0.8, 0.9, 1, 1.1, 1.2, 1.3];

  function getStoredScale() {
    try {
      const val = parseFloat(localStorage.getItem(SCALE_KEY));
      if (SCALE_STEPS.includes(val)) return val;
    } catch {
      // ignore
    }
    return 1;
  }

  function applySiteScale(scale) {
    const clamped = SCALE_STEPS.includes(scale) ? scale : 1;
    document.documentElement.style.setProperty('--site-scale', String(clamped));
    try {
      localStorage.setItem(SCALE_KEY, String(clamped));
    } catch {
      // ignore
    }
    const valEl = document.getElementById('guideScaleVal');
    const decBtn = document.getElementById('guideScaleDec');
    const incBtn = document.getElementById('guideScaleInc');
    if (valEl) valEl.textContent = Math.round(clamped * 100) + '%';
    if (decBtn) decBtn.disabled = clamped <= SCALE_STEPS[0];
    if (incBtn) incBtn.disabled = clamped >= SCALE_STEPS[SCALE_STEPS.length - 1];
  }

  function stepSiteScale(delta) {
    const current = getStoredScale();
    const idx = SCALE_STEPS.indexOf(current);
    const nextIdx = Math.max(0, Math.min(SCALE_STEPS.length - 1, (idx === -1 ? 2 : idx) + delta));
    applySiteScale(SCALE_STEPS[nextIdx]);
  }

  applySiteScale(getStoredScale());

  function getStoredTheme() {
    try {
      const direct = localStorage.getItem(THEME_KEY);
      if (direct === 'dark' || direct === 'light') return direct;
      const legacy = localStorage.getItem('fa_theme') || localStorage.getItem('ck_theme');
      if (legacy === 'dark' || legacy === 'light') return legacy;
    } catch {
      // ignore storage errors
    }
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  function formatThemeLabel(theme) {
    return theme === 'dark' ? '\u2600\uFE0F Light' : '\uD83C\uDF19 Dark';
  }

  function applySiteTheme(theme) {
    const t = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      // ignore
    }
    document.querySelectorAll('[data-site-theme-btn]').forEach((btn) => {
      btn.textContent = formatThemeLabel(t);
      btn.setAttribute('aria-label', t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    });
  }

  function toggleSiteTheme() {
    const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    applySiteTheme(current === 'dark' ? 'light' : 'dark');
  }

  function getStoredCollapsed() {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  }

  function currentFile() {
    const raw = window.location.pathname.split('/').pop() || 'index.html';
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }

  function initSidebar() {
    if (document.getElementById('guideSidebar')) return;

    const current = currentFile();
    document.body.classList.add('has-guide-sidebar');
    if (document.body.dataset.sidebarPad === 'flush') {
      document.body.classList.add('guide-no-extra-pad');
    }
    if (!document.querySelector('.sticky-nav')) {
      document.body.classList.add('guide-no-sticky-nav');
    }

    const existingThemeBtn = document.getElementById('themeToggle');
    if (existingThemeBtn) {
      existingThemeBtn.setAttribute('data-site-theme-btn', 'true');
      existingThemeBtn.addEventListener('click', toggleSiteTheme);
    }

    // Floating top-left representational icon (visible when sidebar is hidden/collapsed)
    const expandFab = document.createElement('button');
    expandFab.type = 'button';
    expandFab.className = 'guide-expand-fab';
    expandFab.id = 'guideExpandFab';
    expandFab.setAttribute('aria-label', 'Open guides sidebar');
    expandFab.setAttribute('aria-expanded', 'false');
    expandFab.setAttribute('aria-controls', 'guideSidebar');
    expandFab.title = 'Open guides sidebar';
    expandFab.innerHTML = '<img src="favicon.svg" alt="Guides">';

    // Backdrop for mobile drawer
    const backdrop = document.createElement('div');
    backdrop.className = 'guide-sidebar-backdrop';
    backdrop.id = 'guideSidebarBackdrop';

    // Sidebar drawer
    const sidebar = document.createElement('aside');
    sidebar.className = 'guide-sidebar';
    sidebar.id = 'guideSidebar';
    sidebar.setAttribute('aria-label', 'Study Guides Navigation');

    let lastGroup = '';
    const linksHtml = GUIDES.map((g, idx) => {
      const isActive = g.href === current || (current === '' && idx === 0);
      const encodedHref = encodeURI(g.href);
      let groupHeading = '';
      if (g.group && g.group !== lastGroup) {
        lastGroup = g.group;
        groupHeading = '<div class="guide-sidebar-label">' + g.group + '</div>';
      }
      return (
        groupHeading +
        '<a class="guide-sidebar-link' +
        (isActive ? ' active' : '') +
        '" href="' +
        encodedHref +
        '"' +
        (isActive ? ' aria-current="page"' : '') +
        '>' +
        '<span class="guide-sidebar-link-title">' +
        g.title +
        '</span>' +
        '<span class="guide-sidebar-link-sub">' +
        g.subtitle +
        '</span>' +
        '</a>'
      );
    }).join('');

    sidebar.innerHTML =
      '<div class="guide-sidebar-header">' +
      '<a class="guide-sidebar-brand" href="index.html">' +
      '<img class="guide-sidebar-logo" src="favicon.svg" alt="" width="28" height="28">' +
      '<span class="guide-sidebar-brand-text">' +
      '<span class="guide-sidebar-kicker">Exam Prep</span>' +
      '<span class="guide-sidebar-title">IBPS RRB Guides</span>' +
      '</span>' +
      '</a>' +
      '<button type="button" class="guide-sidebar-close" id="guideSidebarClose" aria-label="Collapse sidebar" title="Collapse sidebar">&laquo;</button>' +
      '</div>' +
      '<nav class="guide-sidebar-nav" aria-label="Guide pages">' +
      '<div class="guide-sidebar-label">Guides</div>' +
      linksHtml +
      '</nav>' +
      '<div class="guide-sidebar-footer">' +
      '<div class="guide-footer-row" id="guideAiFooterRow" hidden>' +
      '<span>AI Tutor</span>' +
      '<button type="button" class="guide-theme-toggle" id="guideAiOpenBtn">&#10024; Open Chat</button>' +
      '</div>' +
      '<div class="guide-footer-row">' +
      '<span>Text Size</span>' +
      '<div class="guide-scale-controls">' +
      '<button type="button" class="guide-scale-btn" id="guideScaleDec" aria-label="Decrease text size" title="Smaller text">A&minus;</button>' +
      '<span class="guide-scale-val" id="guideScaleVal">100%</span>' +
      '<button type="button" class="guide-scale-btn" id="guideScaleInc" aria-label="Increase text size" title="Larger text">A+</button>' +
      '</div>' +
      '</div>' +
      '<div class="guide-footer-row">' +
      '<span>Theme</span>' +
      '<button type="button" class="guide-theme-toggle" id="guideSidebarThemeBtn" data-site-theme-btn="true"></button>' +
      '</div>' +
      '</div>';

    document.body.prepend(expandFab);
    document.body.prepend(backdrop);
    document.body.prepend(sidebar);

    if (window.StudyAiChat && typeof window.StudyAiChat.open === 'function') {
      const aiRow = document.getElementById('guideAiFooterRow');
      if (aiRow) aiRow.hidden = false;
    }
    document.getElementById('guideAiOpenBtn')?.addEventListener('click', function () {
      if (!desktopMq.matches) closeSidebar();
      window.StudyAiChat?.open();
    });

    document.getElementById('guideSidebarThemeBtn')?.addEventListener('click', toggleSiteTheme);
    document.getElementById('guideScaleDec')?.addEventListener('click', function () {
      stepSiteScale(-1);
    });
    document.getElementById('guideScaleInc')?.addEventListener('click', function () {
      stepSiteScale(1);
    });

    applySiteTheme(getStoredTheme());
    applySiteScale(getStoredScale());

    const closeBtn = document.getElementById('guideSidebarClose');
    const desktopMq = window.matchMedia('(min-width: 860px)');

    function applyDesktopCollapseState(collapsed) {
      document.body.classList.toggle('guide-sidebar-collapsed', collapsed);
      expandFab.classList.toggle('hidden', !collapsed);
      expandFab.setAttribute('aria-expanded', String(!collapsed));
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
      } catch {
        // ignore
      }
    }

    if (desktopMq.matches) {
      applyDesktopCollapseState(getStoredCollapsed());
    }

    function openSidebar() {
      if (desktopMq.matches) {
        applyDesktopCollapseState(false);
      } else {
        sidebar.classList.add('open');
        backdrop.classList.add('open');
        expandFab.classList.add('hidden');
        expandFab.setAttribute('aria-expanded', 'true');
        document.body.style.overflow = 'hidden';
      }
    }

    function closeSidebar() {
      if (desktopMq.matches) {
        applyDesktopCollapseState(true);
      } else {
        sidebar.classList.remove('open');
        backdrop.classList.remove('open');
        expandFab.classList.remove('hidden');
        expandFab.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      }
    }

    expandFab.addEventListener('click', openSidebar);
    closeBtn.addEventListener('click', closeSidebar);
    backdrop.addEventListener('click', closeSidebar);

    desktopMq.addEventListener('change', function (e) {
      sidebar.classList.remove('open');
      backdrop.classList.remove('open');
      document.body.style.overflow = '';
      if (e.matches) {
        applyDesktopCollapseState(getStoredCollapsed());
      } else {
        document.body.classList.remove('guide-sidebar-collapsed');
        expandFab.classList.remove('hidden');
        expandFab.setAttribute('aria-expanded', 'false');
      }
    });

    window.addEventListener('storage', function (e) {
      if (e.key === THEME_KEY && (e.newValue === 'dark' || e.newValue === 'light')) {
        applySiteTheme(e.newValue);
      } else if (e.key === SCALE_KEY && e.newValue) {
        applySiteScale(parseFloat(e.newValue));
      } else if (e.key === SIDEBAR_COLLAPSED_KEY && desktopMq.matches) {
        applyDesktopCollapseState(e.newValue === 'true');
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !desktopMq.matches && sidebar.classList.contains('open')) {
        closeSidebar();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidebar);
  } else {
    initSidebar();
  }
})();
