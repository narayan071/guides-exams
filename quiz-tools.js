(function () {
  'use strict';

  const API_KEY_STORAGE = 'gemini_byok_key';
  const API_KEYS_LIST_STORAGE = 'gemini_byok_keys';
  const ACTIVE_KEY_ID_STORAGE = 'gemini_byok_active_id';
  const MODEL_STORAGE = 'gemini_model';
  const CUSTOM_MODEL_STORAGE = 'gemini_custom_model';
  const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
  let availableModels = [
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite (Recommended)' },
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
    { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
    { id: 'gemini-3.5-pro', label: 'Gemini 3.5 Pro' },
  ];

  function getSlug() {
    return (document.title || 'guide')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  }

  function getTrackerStorageKey() {
    return 'quiz_tracker_' + getSlug();
  }

  function getHighlightsStorageKey() {
    return 'study_hl_' + getSlug();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function saveJson(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch {
      // ignore
    }
  }

  function loadApiKeys() {
    let list = loadJson(API_KEYS_LIST_STORAGE, []);
    if (!Array.isArray(list)) list = [];
    // Migrate legacy single key if list is empty
    if (list.length === 0) {
      try {
        const legacy = localStorage.getItem(API_KEY_STORAGE);
        if (legacy && legacy.trim()) {
          list = [
            {
              id: 'key_default',
              label: 'Primary Key',
              key: legacy.trim(),
              requests: 0,
              inputTokens: 0,
              outputTokens: 0,
            },
          ];
          saveJson(API_KEYS_LIST_STORAGE, list);
          localStorage.setItem(ACTIVE_KEY_ID_STORAGE, 'key_default');
        }
      } catch {
        // ignore
      }
    }
    return list;
  }

  function saveApiKeys(list) {
    saveJson(API_KEYS_LIST_STORAGE, list);
    const active = getActiveKeyEntry(list);
    try {
      if (active) localStorage.setItem(API_KEY_STORAGE, active.key);
      else localStorage.removeItem(API_KEY_STORAGE);
    } catch {
      // ignore
    }
  }

  function getActiveKeyEntry(listOpt) {
    const list = listOpt || loadApiKeys();
    if (list.length === 0) return null;
    let activeId = '';
    try {
      activeId = localStorage.getItem(ACTIVE_KEY_ID_STORAGE) || '';
    } catch {
      // ignore
    }
    return list.find((k) => k.id === activeId) || list[0];
  }

  function setActiveKeyId(id) {
    try {
      if (id) localStorage.setItem(ACTIVE_KEY_ID_STORAGE, id);
      else localStorage.removeItem(ACTIVE_KEY_ID_STORAGE);
      const list = loadApiKeys();
      const active = list.find((k) => k.id === id) || list[0];
      if (active) localStorage.setItem(API_KEY_STORAGE, active.key);
      else localStorage.removeItem(API_KEY_STORAGE);
    } catch {
      // ignore
    }
  }

  function addKeyEntry(label, key) {
    const list = loadApiKeys();
    const cleanKey = key.trim();
    const cleanLabel = (label || '').trim() || 'Key ' + (list.length + 1);
    const existing = list.find((k) => k.key === cleanKey);
    if (existing) {
      existing.label = cleanLabel;
      saveApiKeys(list);
      setActiveKeyId(existing.id);
      return existing;
    }
    const entry = {
      id: 'key_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5),
      label: cleanLabel,
      key: cleanKey,
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
    list.push(entry);
    saveApiKeys(list);
    setActiveKeyId(entry.id);
    return entry;
  }

  function deleteKeyEntry(id) {
    const list = loadApiKeys().filter((k) => k.id !== id);
    saveApiKeys(list);
    if (list.length > 0) setActiveKeyId(list[0].id);
    else setActiveKeyId('');
  }

  function recordKeyUsage(keyId, usageMetadata) {
    if (!keyId) return;
    const list = loadApiKeys();
    const entry = list.find((k) => k.id === keyId);
    if (!entry) return;
    entry.requests = (entry.requests || 0) + 1;
    if (usageMetadata) {
      entry.inputTokens = (entry.inputTokens || 0) + (Number(usageMetadata.promptTokenCount) || 0);
      entry.outputTokens = (entry.outputTokens || 0) + (Number(usageMetadata.candidatesTokenCount) || 0);
    }
    saveApiKeys(list);
  }

  function loadApiKey() {
    const active = getActiveKeyEntry();
    return active ? active.key : '';
  }

  function maskKey(key) {
    if (!key) return '';
    if (key.length <= 8) return '••••';
    return key.slice(0, 4) + '••••' + key.slice(-4);
  }

  function extractChapters() {
    const cards = Array.from(document.querySelectorAll('main section.card'));
    return cards
      .filter((sec) => sec.id && sec.id !== 'tracker' && sec.id !== 'glossary')
      .map((sec) => {
        const h2 = sec.querySelector('h2');
        let title = sec.id;
        if (h2) {
          const clone = h2.cloneNode(true);
          clone.querySelectorAll('.badge').forEach((b) => b.remove());
          title = clone.textContent.replace(/\s+/g, ' ').trim();
        }
        const subtopics = Array.from(sec.querySelectorAll('h3'))
          .filter((h3) => !/quick check/i.test(h3.textContent))
          .map((h3, idx) => ({
            id: sec.id + '__sub_' + idx,
            chapterId: sec.id,
            title: h3.textContent.replace(/\s+/g, ' ').trim(),
            el: h3,
          }));
        return { id: sec.id, title, el: sec, subtopics };
      });
  }

  function extractSubtopicText(h3El) {
    const parts = [h3El.textContent.replace(/\s+/g, ' ').trim()];
    let curr = h3El.nextElementSibling;
    while (curr && curr.tagName !== 'H3' && curr.tagName !== 'H2') {
      parts.push(curr.textContent.replace(/\s+/g, ' ').trim());
      curr = curr.nextElementSibling;
    }
    return parts.join('\n');
  }

  function extractSectionText(secEl) {
    return secEl.textContent.replace(/\s+/g, ' ').trim();
  }

  function formatDuration(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function initQuizTools() {
    const navInner = document.querySelector('.sticky-nav .nav-inner');
    const trackerSec = document.getElementById('tracker');
    if (!navInner && !trackerSec) return;

    const chapters = extractChapters();

    // Inject "Mock Test" button in sticky nav
    if (navInner) {
      const qzNavBtn = document.createElement('button');
      qzNavBtn.type = 'button';
      qzNavBtn.className = 'qz-nav-btn';
      qzNavBtn.id = 'qzNavBtn';
      qzNavBtn.textContent = 'Mock Test';
      const hlBtn = document.getElementById('hlDrawerBtn');
      const themeBtn = document.getElementById('themeToggle');
      const insertRef = hlBtn || themeBtn;
      if (insertRef && insertRef.parentNode === navInner) {
        navInner.insertBefore(qzNavBtn, insertRef);
      } else {
        navInner.appendChild(qzNavBtn);
      }
      qzNavBtn.addEventListener('click', openQuizModal);
    }

    // Build Quiz Modal
    const backdrop = document.createElement('div');
    backdrop.className = 'qz-backdrop';
    backdrop.id = 'qzBackdrop';
    backdrop.innerHTML =
      '<div class="qz-modal" role="dialog" aria-modal="true" aria-labelledby="qzModalTitle">' +
      '<div class="qz-header">' +
      '<div class="qz-header-left">' +
      '<h2 class="qz-title" id="qzModalTitle">AI Mock Test Generator</h2>' +
      '<span class="qz-timer" id="qzTimer" hidden>00:00</span>' +
      '</div>' +
      '<button type="button" class="qz-close" id="qzCloseBtn" aria-label="Close mock test">&times;</button>' +
      '</div>' +
      '<div class="qz-body" id="qzBody"></div>' +
      '<div class="qz-footer" id="qzFooter"></div>' +
      '</div>';
    document.body.appendChild(backdrop);

    const modalTitleEl = document.getElementById('qzModalTitle');
    const timerEl = document.getElementById('qzTimer');
    const bodyEl = document.getElementById('qzBody');
    const footerEl = document.getElementById('qzFooter');
    const closeBtn = document.getElementById('qzCloseBtn');

    // State
    const defaultChapterIds = chapters.slice(0, Math.min(3, chapters.length)).map((c) => c.id);
    let savedModel = localStorage.getItem(MODEL_STORAGE) || DEFAULT_MODEL;
    if (savedModel.startsWith('gemini-2.')) {
      savedModel = DEFAULT_MODEL;
      try { localStorage.setItem(MODEL_STORAGE, savedModel); } catch {}
    }

    const config = {
      sourceMode: 'chapters', // 'chapters' | 'hl-red' | 'hl-yellow' | 'hl-all'
      selectedChapters: new Set(defaultChapterIds),
      selectedSubtopics: new Set(), // empty = all subtopics inside selectedChapters
      numQuestions: 10,
      numOptions: 5,
      difficulty: 'mixed',
      styleMix: 'exam-mix',
      negativeMarking: true,
      timed: true,
      customMinutes: 0,
      instantFeedback: false,
      prioritizeMistakes: true,
      customFocus: '',
      model: savedModel,
      customModel: localStorage.getItem(CUSTOM_MODEL_STORAGE) || '',
      useCustomModel: false,
      showKeyForm: !loadApiKey(),
    };

    let quizState = {
      view: 'config', // 'config' | 'loading' | 'running' | 'results'
      questions: [],
      answers: [], // null or option index
      marked: new Set(),
      revealed: new Set(), // used in practice instantFeedback mode
      currentIndex: 0,
      secondsLeft: 0,
      timerInterval: null,
      reviewFilter: 'all', // 'all' | 'missed' | 'right'
      scopeLabel: '',
      errorMsg: '',
    };

    function stopTimer() {
      if (quizState.timerInterval) {
        clearInterval(quizState.timerInterval);
        quizState.timerInterval = null;
      }
      timerEl.hidden = true;
      timerEl.classList.remove('warn');
    }

    function openQuizModal() {
      backdrop.classList.add('open');
      document.body.style.overflow = 'hidden';
      if (quizState.view === 'config') renderConfigView();
      bodyEl.scrollTop = 0;
    }

    function closeQuizModal() {
      if (quizState.view === 'running' && quizState.questions.length > 0) {
        stopTimer();
        quizState.view = 'config';
      }
      backdrop.classList.remove('open');
      document.body.style.overflow = '';
    }

    closeBtn.addEventListener('click', closeQuizModal);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop && quizState.view !== 'running') closeQuizModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && backdrop.classList.contains('open') && quizState.view !== 'running') {
        closeQuizModal();
      }
    });

    // =========================================================================
    // TRACKER RENDERING (#tracker)
    // =========================================================================
    function renderTrackerSection() {
      if (!trackerSec) return;
      const logs = loadJson(getTrackerStorageKey(), []);
      let html = '<h2>Mock Test Mistake Tracker</h2>';
      html += '<div class="qz-tracker-actions">';
      html +=
        '<span class="qz-muted">' +
        (logs.length === 0
          ? 'No mock tests logged yet. Take an AI Mock Test to log score &amp; missed topics here.'
          : logs.length + ' mock test' + (logs.length === 1 ? '' : 's') + ' logged.') +
        '</span>';
      html += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
      html += '<button type="button" class="qz-btn qz-btn-primary qz-btn-sm" id="qzTrackerStartBtn">+ Take AI Mock Test</button>';
      if (logs.length > 0) {
        html += '<button type="button" class="qz-btn qz-btn-sm" id="qzTrackerClearBtn">Clear Logs</button>';
      }
      html += '</div></div>';

      if (logs.length > 0) {
        html += '<div class="qz-tracker-log">';
        logs.slice().reverse().forEach((entry) => {
          const missed = entry.missed || [];
          html +=
            '<details><summary>' +
            escapeHtml(entry.dateLabel) +
            ' &middot; <strong>' +
            escapeHtml(entry.netScoreText) +
            '</strong> (' +
            entry.correct +
            'R / ' +
            entry.wrong +
            'W / ' +
            entry.skipped +
            'S) &middot; ' +
            escapeHtml(entry.scope) +
            '</summary>';
          if (missed.length === 0) {
            html += '<p style="margin:6px 0 0;font-size:13px;">100% accuracy — no missed topics!</p>';
          } else {
            html += '<ul style="margin:8px 0 0;">';
            missed.forEach((m) => {
              html +=
                '<li><strong>[' +
                escapeHtml(m.status) +
                '] ' +
                escapeHtml(m.topic) +
                ':</strong> ' +
                escapeHtml(m.question) +
                ' &rarr; <em>Ans: ' +
                escapeHtml(m.correctAnswer) +
                '</em></li>';
            });
            html += '</ul>';
          }
          html += '</details>';
        });
        html += '</div>';
      }

      trackerSec.innerHTML = html;
      document.getElementById('qzTrackerStartBtn')?.addEventListener('click', openQuizModal);
      const clrBtn = document.getElementById('qzTrackerClearBtn');
      if (clrBtn) {
        let confirming = false;
        clrBtn.addEventListener('click', () => {
          if (!confirming) {
            confirming = true;
            clrBtn.textContent = 'Confirm Clear?';
            setTimeout(() => {
              confirming = false;
              if (clrBtn.isConnected) clrBtn.textContent = 'Clear Logs';
            }, 3000);
          } else {
            saveJson(getTrackerStorageKey(), []);
            renderTrackerSection();
          }
        });
      }
    }

    // =========================================================================
    // CONFIG VIEW
    // =========================================================================
    function renderConfigView() {
      quizState.view = 'config';
      stopTimer();
      modalTitleEl.textContent = 'AI Mock Test Generator';

      const apiKeys = loadApiKeys();
      const activeKeyObj = getActiveKeyEntry(apiKeys);
      const apiKey = activeKeyObj ? activeKeyObj.key : '';
      const highlights = loadJson(getHighlightsStorageKey(), []);
      const hlCounts = {
        all: highlights.length,
        'hl-red': highlights.filter((h) => h.color === 'hl-red').length,
        'hl-yellow': highlights.filter((h) => h.color === 'hl-yellow').length,
      };

      const selectedSubtopicsAvailable = chapters
        .filter((c) => config.selectedChapters.has(c.id))
        .flatMap((c) => c.subtopics);

      let html = '';

      // 1. BYOK API Keys & Model Card
      html += '<div class="qz-card">';
      html += '<div class="qz-card-head"><h3 class="qz-card-title">1. Gemini API Keys (' + apiKeys.length + ' Saved Locally)</h3>';
      if (apiKeys.length > 0 && !config.showKeyForm) {
        html +=
          '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">' +
          '<button type="button" class="qz-btn qz-btn-sm" id="qzAddKeyBtn">+ Add Key</button>' +
          '<button type="button" class="qz-btn qz-btn-sm" id="qzDeleteKeyBtn">Delete</button>' +
          '</div>';
      }
      html += '</div>';

      if (apiKeys.length > 0 && !config.showKeyForm) {
        html += '<div class="qz-key-row">';
        html += '<select class="qz-select" id="qzActiveKeySelect" style="flex:1;min-width:200px;">';
        apiKeys.forEach((k) => {
          const reqs = k.requests || 0;
          const toks = (k.inputTokens || 0) + (k.outputTokens || 0);
          html +=
            '<option value="' +
            escapeHtml(k.id) +
            '"' +
            (activeKeyObj && activeKeyObj.id === k.id ? ' selected' : '') +
            '>' +
            escapeHtml(k.label) +
            ' (' +
            escapeHtml(maskKey(k.key)) +
            ') &middot; ' +
            reqs +
            ' req / ' +
            toks.toLocaleString() +
            ' tok</option>';
        });
        html += '</select></div>';
        if (activeKeyObj) {
          html +=
            '<div class="qz-muted" style="margin-top:6px;">Local usage for <strong>' +
            escapeHtml(activeKeyObj.label) +
            '</strong>: ' +
            (activeKeyObj.requests || 0) +
            ' requests &middot; ' +
            (activeKeyObj.inputTokens || 0).toLocaleString() +
            ' in / ' +
            (activeKeyObj.outputTokens || 0).toLocaleString() +
            ' out tokens</div>';
        }
      }

      if (apiKeys.length === 0 || config.showKeyForm) {
        html +=
          '<div class="qz-key-row">' +
          '<input type="text" class="qz-input" id="qzKeyLabelInput" placeholder="Label (e.g. Project 1, Backup)" style="flex:0 1 170px;min-width:130px;">' +
          '<input type="password" class="qz-input" id="qzKeyInput" placeholder="Paste Gemini API key (AIza...)">' +
          '<button type="button" class="qz-btn qz-btn-primary qz-btn-sm" id="qzSaveKeyBtn">Save Key</button>' +
          (apiKeys.length > 0 ? '<button type="button" class="qz-btn qz-btn-sm" id="qzCancelKeyBtn">Cancel</button>' : '') +
          '</div>' +
          '<p class="qz-muted" style="margin:6px 0 0;">Stored only in this browser\'s <code>localStorage</code>. Tip: in Google AI Studio, restrict keys to HTTP referrer <code>https://narayan071.github.io/*</code> and Generative Language API.</p>';
      }

      html +=
        '<div style="margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
        '<label for="qzModelSelect" class="qz-muted" style="font-weight:600;">Model:</label>' +
        '<select class="qz-select" id="qzModelSelect">';
      const hasCurrentInList = !config.useCustomModel && availableModels.some((m) => m.id === config.model);
      availableModels.forEach((m) => {
        html +=
          '<option value="' +
          escapeHtml(m.id) +
          '"' +
          (config.model === m.id ? ' selected' : '') +
          '>' +
          escapeHtml(m.label) +
          '</option>';
      });
      html +=
        '<option value="__custom__"' +
        (!hasCurrentInList ? ' selected' : '') +
        '>Custom model ID...</option>';
      html += '</select>';
      if (apiKey) {
        html += '<button type="button" class="qz-btn qz-btn-sm" id="qzSyncModelsBtn" title="Fetch models available to your key">Sync Models</button>';
      }
      if (!hasCurrentInList) {
        html +=
          '<input type="text" class="qz-input" id="qzCustomModelInput" placeholder="e.g. gemini-3.5-flash-lite" value="' +
          escapeHtml(config.customModel || config.model) +
          '">';
      }
      html += '</div></div>';

      // 2. Content Source & Granular Scope
      html += '<div class="qz-card">';
      html += '<div class="qz-card-head"><h3 class="qz-card-title">2. Test Scope (Chapters, Topics, or Highlights)</h3></div>';
      html += '<div class="qz-pill-group" id="qzSourcePills">';
      html +=
        '<button type="button" class="qz-pill' +
        (config.sourceMode === 'chapters' ? ' active' : '') +
        '" data-src="chapters">Chapters &amp; Sub-Topics</button>';
      html +=
        '<button type="button" class="qz-pill' +
        (config.sourceMode === 'hl-red' ? ' active' : '') +
        '" data-src="hl-red"' +
        (hlCounts['hl-red'] === 0 ? ' disabled' : '') +
        '>Red / Weak Highlights (' +
        hlCounts['hl-red'] +
        ')</button>';
      html +=
        '<button type="button" class="qz-pill' +
        (config.sourceMode === 'hl-yellow' ? ' active' : '') +
        '" data-src="hl-yellow"' +
        (hlCounts['hl-yellow'] === 0 ? ' disabled' : '') +
        '>Yellow / Key Highlights (' +
        hlCounts['hl-yellow'] +
        ')</button>';
      html +=
        '<button type="button" class="qz-pill' +
        (config.sourceMode === 'hl-all' ? ' active' : '') +
        '" data-src="hl-all"' +
        (hlCounts.all === 0 ? ' disabled' : '') +
        '>All Highlights (' +
        hlCounts.all +
        ')</button>';
      html += '</div>';

      if (config.sourceMode === 'chapters') {
        html +=
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:6px;flex-wrap:wrap;">' +
          '<span class="qz-muted">' +
          config.selectedChapters.size +
          ' of ' +
          chapters.length +
          ' chapters selected</span>' +
          '<div style="display:flex;gap:6px;">' +
          '<button type="button" class="qz-btn qz-btn-sm" id="qzSelectAllCh">Select All</button>' +
          '<button type="button" class="qz-btn qz-btn-sm" id="qzClearAllCh">Clear All</button>' +
          '</div></div>';

        html += '<div class="qz-chap-list" id="qzChapList">';
        chapters.forEach((c) => {
          const checked = config.selectedChapters.has(c.id);
          html +=
            '<label class="qz-chap-item">' +
            '<input type="checkbox" value="' +
            escapeHtml(c.id) +
            '"' +
            (checked ? ' checked' : '') +
            '>' +
            '<span>' +
            escapeHtml(c.title) +
            '</span></label>';
        });
        html += '</div>';

        if (selectedSubtopicsAvailable.length > 0) {
          html += '<div class="qz-subtopic-list" id="qzSubtopicList">';
          html +=
            '<span class="qz-muted" style="width:100%;font-size:11.5px;">Optional: filter specific sub-topics (' +
            (config.selectedSubtopics.size === 0
              ? 'All sub-topics included'
              : config.selectedSubtopics.size + ' selected') +
            '):</span>';
          selectedSubtopicsAvailable.forEach((st) => {
            const active = config.selectedSubtopics.has(st.id);
            html +=
              '<button type="button" class="qz-sub-chip' +
              (active ? ' active' : '') +
              '" data-sub="' +
              escapeHtml(st.id) +
              '">' +
              escapeHtml(st.title) +
              '</button>';
          });
          html += '</div>';
        }
      } else {
        html +=
          '<p class="qz-muted" style="margin:0;">Questions will be generated from your saved highlights in the selected color group (plus surrounding context).</p>';
      }
      html += '</div>';

      // 3. Exam Parameters
      html += '<div class="qz-card">';
      html += '<div class="qz-card-head"><h3 class="qz-card-title">3. Exam Rules &amp; Format</h3></div>';
      html += '<div class="qz-grid-opts">';

      html +=
        '<div class="qz-field"><label for="qzCount">Questions</label><select class="qz-select" id="qzCount">' +
        [5, 10, 15, 20, 30, 40]
          .map((n) => '<option value="' + n + '"' + (config.numQuestions === n ? ' selected' : '') + '>' + n + ' Questions</option>')
          .join('') +
        '</select></div>';

      html +=
        '<div class="qz-field"><label for="qzOpts">Options</label><select class="qz-select" id="qzOpts">' +
        '<option value="5"' + (config.numOptions === 5 ? ' selected' : '') + '>5 Options (A–E · IBPS)</option>' +
        '<option value="4"' + (config.numOptions === 4 ? ' selected' : '') + '>4 Options (A–D)</option>' +
        '</select></div>';

      html +=
        '<div class="qz-field"><label for="qzDiff">Difficulty</label><select class="qz-select" id="qzDiff">' +
        '<option value="mixed"' + (config.difficulty === 'mixed' ? ' selected' : '') + '>Mixed (Exam Standard)</option>' +
        '<option value="moderate"' + (config.difficulty === 'moderate' ? ' selected' : '') + '>Moderate / Direct</option>' +
        '<option value="hard"' + (config.difficulty === 'hard' ? ' selected' : '') + '>Hard / Trap-Heavy</option>' +
        '</select></div>';

      html +=
        '<div class="qz-field"><label for="qzStyle">Question Style</label><select class="qz-select" id="qzStyle">' +
        '<option value="exam-mix"' + (config.styleMix === 'exam-mix' ? ' selected' : '') + '>Balanced Exam Mix</option>' +
        '<option value="facts"' + (config.styleMix === 'facts' ? ' selected' : '') + '>Years, Limits &amp; Full Forms</option>' +
        '<option value="statements"' + (config.styleMix === 'statements' ? ' selected' : '') + '>Statement / Odd-One-Out</option>' +
        '<option value="applied"' + (config.styleMix === 'applied' ? ' selected' : '') + '>Applied / Scenario Based</option>' +
        '</select></div>';

      html += '</div>';

      html +=
        '<div class="qz-field" style="margin-top:10px;"><label for="qzCustomFocus">Custom Instructions (Optional)</label>' +
        '<input type="text" class="qz-input" id="qzCustomFocus" placeholder="e.g., focus on 2026 rate changes, crossing traps, or RBI subsidiaries" value="' +
        escapeHtml(config.customFocus) +
        '"></div>';

      html += '<div class="qz-check-row">';
      html +=
        '<label><input type="checkbox" id="qzNegCheck"' +
        (config.negativeMarking ? ' checked' : '') +
        '> Negative marking (+1 / &minus;0.25)</label>';
      html +=
        '<label><input type="checkbox" id="qzTimedCheck"' +
        (config.timed ? ' checked' : '') +
        '> IBPS Pace Timer (~22.5s/Q)</label>';
      html +=
        '<label><input type="checkbox" id="qzInstantCheck"' +
        (config.instantFeedback ? ' checked' : '') +
        '> Practice Mode (instant answers)</label>';
      html +=
        '<label><input type="checkbox" id="qzMistakeCheck"' +
        (config.prioritizeMistakes ? ' checked' : '') +
        '> Prioritize past logged mistakes</label>';
      html += '</div>';

      html += '</div>';

      if (quizState.errorMsg) {
        html += '<div class="qz-error">' + escapeHtml(quizState.errorMsg) + '</div>';
      }

      bodyEl.innerHTML = html;
      bodyEl.scrollTop = 0;

      footerEl.innerHTML =
        '<span class="qz-muted">Questions are grounded strictly in this guide.</span>' +
        '<button type="button" class="qz-btn qz-btn-primary" id="qzGenerateBtn">Generate &amp; Start Test</button>';

      // Wire Config Listeners
      document.getElementById('qzActiveKeySelect')?.addEventListener('change', (e) => {
        setActiveKeyId(e.target.value);
        quizState.errorMsg = '';
        renderConfigView();
      });
      document.getElementById('qzAddKeyBtn')?.addEventListener('click', () => {
        config.showKeyForm = true;
        renderConfigView();
      });
      document.getElementById('qzCancelKeyBtn')?.addEventListener('click', () => {
        config.showKeyForm = false;
        renderConfigView();
      });
      document.getElementById('qzDeleteKeyBtn')?.addEventListener('click', () => {
        if (!activeKeyObj) return;
        deleteKeyEntry(activeKeyObj.id);
        if (loadApiKeys().length === 0) config.showKeyForm = true;
        renderConfigView();
      });
      document.getElementById('qzSaveKeyBtn')?.addEventListener('click', () => {
        const label = (document.getElementById('qzKeyLabelInput')?.value || '').trim();
        const val = (document.getElementById('qzKeyInput')?.value || '').trim();
        if (!val) {
          quizState.errorMsg = 'Please enter a valid Gemini API key.';
          renderConfigView();
          return;
        }
        addKeyEntry(label, val);
        config.showKeyForm = false;
        quizState.errorMsg = '';
        renderConfigView();
      });

      document.getElementById('qzModelSelect')?.addEventListener('change', (e) => {
        if (e.target.value === '__custom__') {
          config.useCustomModel = true;
          config.model = config.customModel || DEFAULT_MODEL;
          renderConfigView();
          return;
        }
        config.useCustomModel = false;
        config.model = e.target.value;
        try { localStorage.setItem(MODEL_STORAGE, config.model); } catch {}
        renderConfigView();
      });

      document.getElementById('qzCustomModelInput')?.addEventListener('input', (e) => {
        const val = e.target.value.trim().replace(/^models\//, '');
        config.customModel = val;
        if (val) {
          config.model = val;
          try {
            localStorage.setItem(CUSTOM_MODEL_STORAGE, val);
            localStorage.setItem(MODEL_STORAGE, val);
          } catch {}
        }
      });

      document.getElementById('qzSyncModelsBtn')?.addEventListener('click', async () => {
        const key = loadApiKey();
        if (!key) return;
        const btn = document.getElementById('qzSyncModelsBtn');
        if (btn) {
          btn.disabled = true;
          btn.textContent = 'Syncing...';
        }
        try {
          const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
            headers: { 'x-goog-api-key': key },
          });
          if (!r.ok) throw new Error('Failed to list models (' + r.status + ')');
          const d = await r.json();
          const list = (d.models || [])
            .filter(
              (m) =>
                Array.isArray(m.supportedGenerationMethods) &&
                m.supportedGenerationMethods.includes('generateContent') &&
                /gemini/i.test(m.name || '')
            )
            .map((m) => {
              const id = String(m.name).replace(/^models\//, '');
              return { id, label: m.displayName ? m.displayName + ' (' + id + ')' : id };
            });
          if (list.length > 0) {
            availableModels = list;
            if (!list.some((m) => m.id === config.model)) {
              const preferred = list.find((m) => m.id === DEFAULT_MODEL) || list[0];
              config.model = preferred.id;
              try { localStorage.setItem(MODEL_STORAGE, config.model); } catch {}
            }
          }
          quizState.errorMsg = '';
        } catch (err) {
          quizState.errorMsg = err.message || 'Could not fetch model list.';
        }
        renderConfigView();
      });

      document.getElementById('qzSourcePills')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-src]');
        if (!btn || btn.disabled) return;
        config.sourceMode = btn.dataset.src;
        quizState.errorMsg = '';
        renderConfigView();
      });

      document.getElementById('qzSelectAllCh')?.addEventListener('click', () => {
        chapters.forEach((c) => config.selectedChapters.add(c.id));
        config.selectedSubtopics.clear();
        renderConfigView();
      });
      document.getElementById('qzClearAllCh')?.addEventListener('click', () => {
        config.selectedChapters.clear();
        config.selectedSubtopics.clear();
        renderConfigView();
      });

      document.getElementById('qzChapList')?.addEventListener('change', (e) => {
        const cb = e.target;
        if (!cb || cb.type !== 'checkbox') return;
        if (cb.checked) config.selectedChapters.add(cb.value);
        else {
          config.selectedChapters.delete(cb.value);
          // Remove any subtopics belonging to deselected chapter
          Array.from(config.selectedSubtopics).forEach((sid) => {
            if (sid.startsWith(cb.value + '__')) config.selectedSubtopics.delete(sid);
          });
        }
        renderConfigView();
      });

      document.getElementById('qzSubtopicList')?.addEventListener('click', (e) => {
        const chip = e.target.closest('[data-sub]');
        if (!chip) return;
        const sid = chip.dataset.sub;
        if (config.selectedSubtopics.has(sid)) config.selectedSubtopics.delete(sid);
        else config.selectedSubtopics.add(sid);
        renderConfigView();
      });

      document.getElementById('qzCount')?.addEventListener('change', (e) => {
        config.numQuestions = parseInt(e.target.value, 10) || 10;
      });
      document.getElementById('qzOpts')?.addEventListener('change', (e) => {
        config.numOptions = parseInt(e.target.value, 10) || 5;
      });
      document.getElementById('qzDiff')?.addEventListener('change', (e) => {
        config.difficulty = e.target.value;
      });
      document.getElementById('qzStyle')?.addEventListener('change', (e) => {
        config.styleMix = e.target.value;
      });
      document.getElementById('qzCustomFocus')?.addEventListener('input', (e) => {
        config.customFocus = e.target.value;
      });
      document.getElementById('qzNegCheck')?.addEventListener('change', (e) => {
        config.negativeMarking = e.target.checked;
      });
      document.getElementById('qzTimedCheck')?.addEventListener('change', (e) => {
        config.timed = e.target.checked;
      });
      document.getElementById('qzInstantCheck')?.addEventListener('change', (e) => {
        config.instantFeedback = e.target.checked;
      });
      document.getElementById('qzMistakeCheck')?.addEventListener('change', (e) => {
        config.prioritizeMistakes = e.target.checked;
      });

      document.getElementById('qzGenerateBtn')?.addEventListener('click', startQuizGeneration);
    }

    // =========================================================================
    // CONTENT ASSEMBLY & GEMINI API CALL
    // =========================================================================
    function buildSourcePayload() {
      if (config.sourceMode === 'chapters') {
        if (config.selectedChapters.size === 0) {
          throw new Error('Select at least one chapter to generate questions.');
        }
        const selectedChaps = chapters.filter((c) => config.selectedChapters.has(c.id));
        const blocks = [];
        let scopeLabel = '';

        if (config.selectedSubtopics.size > 0) {
          const pickedSubs = selectedChaps
            .flatMap((c) => c.subtopics)
            .filter((st) => config.selectedSubtopics.has(st.id));
          pickedSubs.forEach((st) => {
            blocks.push('[ChapterId: ' + st.chapterId + '] Topic: ' + st.title + '\n' + extractSubtopicText(st.el));
          });
          scopeLabel = pickedSubs.length + ' topic' + (pickedSubs.length === 1 ? '' : 's');
        } else {
          selectedChaps.forEach((c) => {
            blocks.push('[ChapterId: ' + c.id + '] ' + c.title + '\n' + extractSectionText(c.el));
          });
          scopeLabel =
            selectedChaps.length === chapters.length
              ? 'Full Guide'
              : selectedChaps.map((c) => c.id.toUpperCase()).join(', ');
        }
        return { content: blocks.join('\n\n---\n\n'), scopeLabel };
      }

      const highlights = loadJson(getHighlightsStorageKey(), []);
      const filtered =
        config.sourceMode === 'hl-all'
          ? highlights
          : highlights.filter((h) => h.color === config.sourceMode);

      if (filtered.length === 0) {
        throw new Error('No saved highlights found in the selected color group.');
      }

      const lines = filtered.map((h, i) => {
        const ctx = [h.prefix, h.text, h.suffix].filter(Boolean).join('');
        return (i + 1) + '. [ChapterId: ' + (h.chapterId || 'ch1') + '] ' + ctx;
      });
      const labelMap = {
        'hl-red': 'Weak Highlights (' + filtered.length + ')',
        'hl-yellow': 'Key Highlights (' + filtered.length + ')',
        'hl-all': 'All Highlights (' + filtered.length + ')',
      };
      return { content: lines.join('\n'), scopeLabel: labelMap[config.sourceMode] };
    }

    async function callGeminiQuizAPI(keyEntry, sourceText) {
      const apiKey = keyEntry.key;
      const logs = loadJson(getTrackerStorageKey(), []);
      const pastMistakes = config.prioritizeMistakes
        ? logs
            .slice(-3)
            .flatMap((l) => l.missed || [])
            .slice(0, 12)
            .map((m) => '- ' + m.topic + ': ' + m.question)
            .join('\n')
        : '';

      const diffNote =
        config.difficulty === 'hard'
          ? 'Make questions challenging with close numerical traps, statement-based options, or subtle distinctions.'
          : config.difficulty === 'moderate'
          ? 'Make questions clear and straightforward, testing direct recall of facts.'
          : 'Use a realistic IBPS RRB Scale 2 mix of direct recall, numerical limits, and close trap options.';

      const styleNote =
        config.styleMix === 'facts'
          ? 'Focus heavily on exact years, limits, committees, full forms, and numbers.'
          : config.styleMix === 'statements'
          ? 'Include "Which of the following statements is/are correct/incorrect?" and odd-one-out questions.'
          : config.styleMix === 'applied'
          ? 'Include scenario-based and conceptual application questions.'
          : 'Mix direct fact questions, tricky comparisons, and scenario questions.';

      const prompt = [
        'You are an IBPS RRB Scale 2 exam question setter.',
        'Generate EXACTLY ' + config.numQuestions + ' unique multiple-choice questions strictly grounded in the STUDY MATERIAL below.',
        'Rules:',
        '- Each question MUST have EXACTLY ' + config.numOptions + ' options (without "A)", "1." prefixes — plain option text only).',
        '- Do not invent numbers, dates, or facts not supported by the provided material.',
        '- ' + diffNote,
        '- ' + styleNote,
        config.customFocus ? '- Extra user focus: ' + config.customFocus : '',
        pastMistakes ? '- Also reinforce/re-test concepts related to these past missed items (without repeating word-for-word):\n' + pastMistakes : '',
        '- Return valid JSON matching the schema. "correctIndex" must be 0 to ' + (config.numOptions - 1) + '.',
        '- "chapterId" must match one of the [ChapterId: ...] tags from the material.',
        '- "explanation" should clearly state why the right answer is correct and call out any trap.',
        '',
        'STUDY MATERIAL:',
        sourceText,
      ]
        .filter(Boolean)
        .join('\n');

      const endpoint =
        'https://generativelanguage.googleapis.com/v1beta/models/' +
        encodeURIComponent(config.model) +
        ':generateContent';

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                questions: {
                  type: 'ARRAY',
                  items: {
                    type: 'OBJECT',
                    properties: {
                      topic: { type: 'STRING' },
                      chapterId: { type: 'STRING' },
                      question: { type: 'STRING' },
                      options: { type: 'ARRAY', items: { type: 'STRING' } },
                      correctIndex: { type: 'INTEGER' },
                      explanation: { type: 'STRING' },
                    },
                    required: ['topic', 'chapterId', 'question', 'options', 'correctIndex', 'explanation'],
                  },
                },
              },
              required: ['questions'],
            },
          },
        }),
      });

      if (!resp.ok) {
        let errText = 'Gemini API error (' + resp.status + ')';
        try {
          const errJson = await resp.json();
          if (errJson.error?.message) errText = errJson.error.message;
        } catch {}
        if (resp.status === 429 && loadApiKeys().length > 1) {
          errText += ' — Tip: switch to another saved key or model above.';
        }
        throw new Error(errText);
      }

      const data = await resp.json();
      recordKeyUsage(keyEntry.id, data?.usageMetadata);
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error('Gemini returned an empty response. Try again.');

      const parsed = JSON.parse(rawText);
      const qs = Array.isArray(parsed.questions) ? parsed.questions : [];
      const valid = qs.filter(
        (q) =>
          q &&
          typeof q.question === 'string' &&
          Array.isArray(q.options) &&
          q.options.length >= 2 &&
          Number.isInteger(q.correctIndex) &&
          q.correctIndex >= 0 &&
          q.correctIndex < q.options.length
      );
      if (valid.length === 0) throw new Error('No valid questions generated. Try a different scope.');
      return valid;
    }

    async function startQuizGeneration() {
      const activeKeyObj = getActiveKeyEntry();
      if (!activeKeyObj) {
        quizState.errorMsg = 'Please save your Gemini API key first.';
        config.showKeyForm = true;
        renderConfigView();
        return;
      }

      let payload;
      try {
        payload = buildSourcePayload();
      } catch (err) {
        quizState.errorMsg = err.message;
        renderConfigView();
        return;
      }

      quizState.errorMsg = '';
      quizState.view = 'loading';
      quizState.scopeLabel = payload.scopeLabel;
      modalTitleEl.textContent = 'Generating Test...';
      bodyEl.innerHTML =
        '<div class="qz-loading">' +
        '<div class="qz-spinner"></div>' +
        '<strong>Generating ' + config.numQuestions + ' questions via ' + escapeHtml(config.model) + '...</strong>' +
        '<p class="qz-muted" style="margin-top:6px;">Key: ' + escapeHtml(activeKeyObj.label) + ' &middot; Scope: ' + escapeHtml(payload.scopeLabel) + '</p>' +
        '</div>';
      footerEl.innerHTML = '<span class="qz-muted">Please wait...</span>';

      try {
        const questions = await callGeminiQuizAPI(activeKeyObj, payload.content);
        beginQuizSession(questions, payload.scopeLabel);
      } catch (err) {
        quizState.view = 'config';
        quizState.errorMsg = err.message || 'Failed to generate test.';
        renderConfigView();
      }
    }

    // =========================================================================
    // QUIZ RUNNER
    // =========================================================================
    function beginQuizSession(questions, scopeLabel) {
      stopTimer();
      quizState.view = 'running';
      quizState.questions = questions;
      quizState.answers = new Array(questions.length).fill(null);
      quizState.marked = new Set();
      quizState.revealed = new Set();
      quizState.currentIndex = 0;
      quizState.scopeLabel = scopeLabel;

      if (config.timed) {
        quizState.secondsLeft = Math.max(60, Math.round(questions.length * 22.5));
        timerEl.hidden = false;
        timerEl.textContent = formatDuration(quizState.secondsLeft);
        quizState.timerInterval = setInterval(() => {
          quizState.secondsLeft--;
          timerEl.textContent = formatDuration(Math.max(0, quizState.secondsLeft));
          if (quizState.secondsLeft <= 30) timerEl.classList.add('warn');
          if (quizState.secondsLeft <= 0) {
            submitQuiz();
          }
        }, 1000);
      }

      renderQuestionView();
    }

    function renderQuestionView() {
      const qs = quizState.questions;
      const idx = quizState.currentIndex;
      const q = qs[idx];
      const chosen = quizState.answers[idx];
      const isRevealed = config.instantFeedback && quizState.revealed.has(idx);
      const letters = ['A', 'B', 'C', 'D', 'E'];

      modalTitleEl.textContent = 'Mock Test · Q' + (idx + 1) + ' / ' + qs.length;

      let html = '<div class="qz-palette" id="qzPalette">';
      qs.forEach((_, i) => {
        const cls = ['qz-pal-btn'];
        if (i === idx) cls.push('current');
        if (quizState.marked.has(i)) cls.push('marked');
        else if (quizState.answers[i] !== null) cls.push('answered');
        html += '<button type="button" class="' + cls.join(' ') + '" data-qidx="' + i + '">' + (i + 1) + '</button>';
      });
      html += '</div>';

      html +=
        '<div class="qz-q-meta">' +
        '<span class="qz-q-topic">' + escapeHtml(q.topic || q.chapterId || 'General') + '</span>' +
        '<div style="display:flex;gap:6px;">' +
        '<button type="button" class="qz-btn qz-btn-sm" id="qzMarkBtn">' +
        (quizState.marked.has(idx) ? '★ Marked' : '☆ Mark Review') +
        '</button>' +
        '<button type="button" class="qz-btn qz-btn-sm" id="qzClearRespBtn"' +
        (chosen === null || isRevealed ? ' disabled' : '') +
        '>Clear</button>' +
        '</div></div>';

      html += '<p class="qz-q-text">' + (idx + 1) + '. ' + escapeHtml(q.question) + '</p>';

      html += '<div class="qz-options" id="qzOptions">';
      q.options.forEach((opt, oi) => {
        const cls = ['qz-opt-btn'];
        if (isRevealed) {
          if (oi === q.correctIndex) cls.push('correct');
          else if (oi === chosen) cls.push('wrong');
        } else if (oi === chosen) {
          cls.push('selected');
        }
        html +=
          '<button type="button" class="' +
          cls.join(' ') +
          '" data-opt="' +
          oi +
          '"' +
          (isRevealed ? ' disabled' : '') +
          '>' +
          '<span class="qz-opt-key">' +
          (letters[oi] || oi + 1) +
          '</span><span>' +
          escapeHtml(opt) +
          '</span></button>';
      });
      html += '</div>';

      if (isRevealed) {
        html +=
          '<div class="qz-exp-box"><strong>Explanation:</strong> ' +
          escapeHtml(q.explanation) +
          '</div>';
      }

      bodyEl.innerHTML = html;
      bodyEl.scrollTop = 0;

      footerEl.innerHTML =
        '<div style="display:flex;gap:8px;">' +
        '<button type="button" class="qz-btn" id="qzPrevBtn"' + (idx === 0 ? ' disabled' : '') + '>&larr; Prev</button>' +
        '<button type="button" class="qz-btn" id="qzNextBtn"' + (idx === qs.length - 1 ? ' disabled' : '') + '>Next &rarr;</button>' +
        '</div>' +
        '<div style="display:flex;gap:8px;">' +
        '<button type="button" class="qz-btn" id="qzQuitBtn">Back to Setup</button>' +
        '<button type="button" class="qz-btn qz-btn-primary" id="qzSubmitBtn">Submit Test</button>' +
        '</div>';

      document.getElementById('qzPalette')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-qidx]');
        if (!btn) return;
        quizState.currentIndex = parseInt(btn.dataset.qidx, 10);
        renderQuestionView();
      });

      document.getElementById('qzOptions')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-opt]');
        if (!btn || btn.disabled) return;
        const oi = parseInt(btn.dataset.opt, 10);
        quizState.answers[idx] = oi;
        if (config.instantFeedback) quizState.revealed.add(idx);
        renderQuestionView();
      });

      document.getElementById('qzMarkBtn')?.addEventListener('click', () => {
        if (quizState.marked.has(idx)) quizState.marked.delete(idx);
        else quizState.marked.add(idx);
        renderQuestionView();
      });

      document.getElementById('qzClearRespBtn')?.addEventListener('click', () => {
        quizState.answers[idx] = null;
        renderQuestionView();
      });

      document.getElementById('qzPrevBtn')?.addEventListener('click', () => {
        if (quizState.currentIndex > 0) {
          quizState.currentIndex--;
          renderQuestionView();
        }
      });
      document.getElementById('qzNextBtn')?.addEventListener('click', () => {
        if (quizState.currentIndex < qs.length - 1) {
          quizState.currentIndex++;
          renderQuestionView();
        }
      });
      document.getElementById('qzQuitBtn')?.addEventListener('click', () => {
        stopTimer();
        renderConfigView();
      });
      document.getElementById('qzSubmitBtn')?.addEventListener('click', submitQuiz);
    }

    function submitQuiz() {
      stopTimer();
      quizState.view = 'results';
      quizState.reviewFilter = 'all';

      const qs = quizState.questions;
      let correct = 0;
      let wrong = 0;
      let skipped = 0;
      const missed = [];

      qs.forEach((q, i) => {
        const ans = quizState.answers[i];
        if (ans === null) {
          skipped++;
          missed.push({
            status: 'Skipped',
            topic: q.topic || q.chapterId || 'General',
            question: q.question,
            correctAnswer: q.options[q.correctIndex],
          });
        } else if (ans === q.correctIndex) {
          correct++;
        } else {
          wrong++;
          missed.push({
            status: 'Wrong',
            topic: q.topic || q.chapterId || 'General',
            question: q.question,
            correctAnswer: q.options[q.correctIndex],
          });
        }
      });

      const netScore = config.negativeMarking ? correct - wrong * 0.25 : correct;
      const netScoreText = netScore.toFixed(2).replace(/\.00$/, '') + ' / ' + qs.length;

      // Persist in #tracker localStorage
      const logs = loadJson(getTrackerStorageKey(), []);
      const now = new Date();
      logs.push({
        id: 'qz_' + Date.now(),
        dateLabel: now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        scope: quizState.scopeLabel,
        correct,
        wrong,
        skipped,
        netScoreText,
        missed,
      });
      saveJson(getTrackerStorageKey(), logs.slice(-20));
      renderTrackerSection();

      renderResultsView(correct, wrong, skipped, netScoreText);
    }

    function renderResultsView(correct, wrong, skipped, netScoreText) {
      const qs = quizState.questions;
      const attempted = correct + wrong;
      const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
      const letters = ['A', 'B', 'C', 'D', 'E'];

      modalTitleEl.textContent = 'Test Results · ' + netScoreText;

      let html = '<div class="qz-score-grid">';
      html += '<div class="qz-score-stat"><b>' + escapeHtml(netScoreText) + '</b><span>Net Score</span></div>';
      html += '<div class="qz-score-stat"><b>' + correct + '</b><span>Correct</span></div>';
      html += '<div class="qz-score-stat"><b>' + wrong + '</b><span>Wrong</span></div>';
      html += '<div class="qz-score-stat"><b>' + skipped + '</b><span>Skipped</span></div>';
      html += '<div class="qz-score-stat"><b>' + accuracy + '%</b><span>Accuracy</span></div>';
      html += '</div>';

      html += '<div class="qz-pill-group" id="qzRevFilter">';
      html += '<button type="button" class="qz-pill' + (quizState.reviewFilter === 'all' ? ' active' : '') + '" data-rf="all">All (' + qs.length + ')</button>';
      html += '<button type="button" class="qz-pill' + (quizState.reviewFilter === 'missed' ? ' active' : '') + '" data-rf="missed">Wrong &amp; Skipped (' + (wrong + skipped) + ')</button>';
      html += '<button type="button" class="qz-pill' + (quizState.reviewFilter === 'right' ? ' active' : '') + '" data-rf="right">Correct (' + correct + ')</button>';
      html += '</div>';

      const missedQuestions = [];
      qs.forEach((q, i) => {
        const ans = quizState.answers[i];
        const isRight = ans === q.correctIndex;
        const isSkip = ans === null;
        if (!isRight) missedQuestions.push(q);

        if (quizState.reviewFilter === 'missed' && isRight) return;
        if (quizState.reviewFilter === 'right' && !isRight) return;

        const cardCls = isRight ? 'rev-right' : isSkip ? 'rev-skip' : 'rev-wrong';
        const statusTxt = isRight ? 'Correct (+1)' : isSkip ? 'Skipped (0)' : config.negativeMarking ? 'Wrong (−0.25)' : 'Wrong (0)';

        html += '<div class="qz-rev-card ' + cardCls + '">';
        html +=
          '<div class="qz-q-meta">' +
          '<span class="qz-q-topic">' + escapeHtml(q.topic || q.chapterId || 'General') + ' &middot; ' + statusTxt + '</span>' +
          (q.chapterId && document.getElementById(q.chapterId)
            ? '<button type="button" class="qz-btn qz-btn-sm" data-jumpchap="' + escapeHtml(q.chapterId) + '">Go to Chapter</button>'
            : '') +
          '</div>';
        html += '<p class="qz-q-text" style="font-size:14px;margin-bottom:8px;">' + (i + 1) + '. ' + escapeHtml(q.question) + '</p>';
        if (!isSkip && !isRight) {
          html += '<div style="font-size:13px;color:var(--red-text);margin-bottom:4px;"><strong>Your Answer:</strong> ' + (letters[ans] || ans + 1) + '. ' + escapeHtml(q.options[ans]) + '</div>';
        }
        html += '<div style="font-size:13px;color:var(--green-text);margin-bottom:6px;"><strong>Correct Answer:</strong> ' + (letters[q.correctIndex] || q.correctIndex + 1) + '. ' + escapeHtml(q.options[q.correctIndex]) + '</div>';
        html += '<div style="font-size:13px;color:var(--muted);">' + escapeHtml(q.explanation) + '</div>';
        html += '</div>';
      });

      bodyEl.innerHTML = html;
      bodyEl.scrollTop = 0;

      footerEl.innerHTML =
        '<button type="button" class="qz-btn" id="qzNewSetupBtn">New Test Setup</button>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
        (missedQuestions.length > 0
          ? '<button type="button" class="qz-btn" id="qzRetakeMissedBtn">Retake Missed (' + missedQuestions.length + ')</button>'
          : '') +
        '<button type="button" class="qz-btn qz-btn-primary" id="qzDoneBtn">Done</button>' +
        '</div>';

      document.getElementById('qzRevFilter')?.addEventListener('click', (e) => {
        const pill = e.target.closest('[data-rf]');
        if (!pill) return;
        quizState.reviewFilter = pill.dataset.rf;
        renderResultsView(correct, wrong, skipped, netScoreText);
      });

      bodyEl.querySelectorAll('[data-jumpchap]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const cid = btn.dataset.jumpchap;
          const target = document.getElementById(cid);
          closeQuizModal();
          if (target) {
            target.classList.remove('hidden-card');
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });
      });

      document.getElementById('qzNewSetupBtn')?.addEventListener('click', renderConfigView);
      document.getElementById('qzDoneBtn')?.addEventListener('click', closeQuizModal);
      document.getElementById('qzRetakeMissedBtn')?.addEventListener('click', () => {
        beginQuizSession(missedQuestions, 'Retake Missed (' + missedQuestions.length + ')');
      });
    }

    renderTrackerSection();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initQuizTools);
  } else {
    initQuizTools();
  }
})();
