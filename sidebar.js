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
  ];

  const THEME_KEY = 'site_theme';
  const SCALE_KEY = 'site_scale';
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

  // Apply stored scale immediately to minimize layout shift
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
    const activeGuide = GUIDES.find((g) => g.href === current) || GUIDES[0];

    document.body.classList.add('has-guide-sidebar');
    if (document.body.dataset.sidebarPad === 'flush') {
      document.body.classList.add('guide-no-extra-pad');
    }

    const existingThemeBtn = document.getElementById('themeToggle');
    if (existingThemeBtn) {
      existingThemeBtn.setAttribute('data-site-theme-btn', 'true');
      existingThemeBtn.addEventListener('click', toggleSiteTheme);
    }

    // Mobile top bar with drawer toggle button (and theme toggle on pages without sticky-nav)
    const mobileBar = document.createElement('div');
    mobileBar.className = 'guide-mobile-bar';
    mobileBar.innerHTML =
      '<button type="button" class="guide-menu-btn" id="guideMenuBtn" aria-label="Open guides menu" aria-expanded="false" aria-controls="guideSidebar">' +
      '<span aria-hidden="true">&#9776;</span><span>Guides</span>' +
      '</button>' +
      '<img class="guide-mobile-logo" src="favicon.svg" alt="" width="20" height="20">' +
      '<span class="guide-mobile-title"></span>' +
      (existingThemeBtn
        ? ''
        : '<button type="button" class="guide-theme-toggle" id="guideMobileThemeBtn" data-site-theme-btn="true"></button>');
    mobileBar.querySelector('.guide-mobile-title').textContent = activeGuide.title;

    // Backdrop for mobile drawer
    const backdrop = document.createElement('div');
    backdrop.className = 'guide-sidebar-backdrop';
    backdrop.id = 'guideSidebarBackdrop';

    // Sidebar drawer
    const sidebar = document.createElement('aside');
    sidebar.className = 'guide-sidebar';
    sidebar.id = 'guideSidebar';
    sidebar.setAttribute('aria-label', 'Study Guides Navigation');

    const linksHtml = GUIDES.map((g, idx) => {
      const isActive = g.href === current || (current === '' && idx === 0);
      const encodedHref = encodeURI(g.href);
      return (
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
      '<button type="button" class="guide-sidebar-close" id="guideSidebarClose" aria-label="Close guides menu">&times;</button>' +
      '</div>' +
      '<nav class="guide-sidebar-nav" aria-label="Guide pages">' +
      '<div class="guide-sidebar-label">Guides</div>' +
      linksHtml +
      '</nav>' +
      '<div class="guide-sidebar-footer">' +
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

    document.body.prepend(mobileBar);
    document.body.prepend(backdrop);
    document.body.prepend(sidebar);

    document.getElementById('guideSidebarThemeBtn')?.addEventListener('click', toggleSiteTheme);
    document.getElementById('guideMobileThemeBtn')?.addEventListener('click', toggleSiteTheme);
    document.getElementById('guideScaleDec')?.addEventListener('click', function () { stepSiteScale(-1); });
    document.getElementById('guideScaleInc')?.addEventListener('click', function () { stepSiteScale(1); });

    applySiteTheme(getStoredTheme());
    applySiteScale(getStoredScale());

    window.addEventListener('storage', function (e) {
      if (e.key === THEME_KEY && (e.newValue === 'dark' || e.newValue === 'light')) {
        applySiteTheme(e.newValue);
      } else if (e.key === SCALE_KEY && e.newValue) {
        applySiteScale(parseFloat(e.newValue));
      }
    });

    function syncMobileBarHeight() {
      const h = mobileBar.offsetHeight;
      if (h > 0) {
        document.documentElement.style.setProperty('--guide-mobile-bar-h', h + 'px');
      }
    }
    syncMobileBarHeight();
    window.addEventListener('resize', syncMobileBarHeight);

    const menuBtn = document.getElementById('guideMenuBtn');
    const closeBtn = document.getElementById('guideSidebarClose');

    function openDrawer() {
      sidebar.classList.add('open');
      backdrop.classList.add('open');
      menuBtn.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
    }

    function closeDrawer() {
      sidebar.classList.remove('open');
      backdrop.classList.remove('open');
      menuBtn.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }

    menuBtn.addEventListener('click', openDrawer);
    closeBtn.addEventListener('click', closeDrawer);
    backdrop.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && sidebar.classList.contains('open')) {
        closeDrawer();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidebar);
  } else {
    initSidebar();
  }
})();
