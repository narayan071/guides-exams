(function () {
  const GUIDES = [
    {
      href: 'index.html',
      title: 'All Guides',
      subtitle: 'Overview & quick links',
    },
    {
      href: 'Financial Awareness Gap Guide.html',
      title: 'Financial Awareness',
      subtitle: 'IBPS RRB GBO Scale II · PYQ Gap Guide',
    },
    {
      href: 'computer_knowledge_guide.html',
      title: 'Computer Knowledge',
      subtitle: 'IBPS RRB Scale 2 (IT) · Master Guide',
    },
  ];

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

    // Mobile top bar with drawer toggle button
    const mobileBar = document.createElement('div');
    mobileBar.className = 'guide-mobile-bar';
    mobileBar.innerHTML =
      '<button type="button" class="guide-menu-btn" id="guideMenuBtn" aria-label="Open guides menu" aria-expanded="false" aria-controls="guideSidebar">' +
      '<span aria-hidden="true">&#9776;</span><span>Guides</span>' +
      '</button>' +
      '<span class="guide-mobile-title"></span>';
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
      '<span class="guide-sidebar-kicker">Exam Prep</span>' +
      '<span class="guide-sidebar-title">IBPS RRB Guides</span>' +
      '</a>' +
      '<button type="button" class="guide-sidebar-close" id="guideSidebarClose" aria-label="Close guides menu">&times;</button>' +
      '</div>' +
      '<nav class="guide-sidebar-nav" aria-label="Guide pages">' +
      '<div class="guide-sidebar-label">Guides</div>' +
      linksHtml +
      '</nav>' +
      '<div class="guide-sidebar-footer">1 HTML page per guide</div>';

    document.body.prepend(mobileBar);
    document.body.prepend(backdrop);
    document.body.prepend(sidebar);

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
