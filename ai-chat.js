(function () {
  'use strict';

  const API_KEY_STORAGE = 'gemini_byok_key';
  const API_KEYS_LIST_STORAGE = 'gemini_byok_keys';
  const ACTIVE_KEY_ID_STORAGE = 'gemini_byok_active_id';
  const QUIZ_MODEL_STORAGE = 'gemini_model';
  const CHAT_MODEL_STORAGE = 'gemini_chat_model';
  const CHAT_CUSTOM_MODEL_STORAGE = 'gemini_chat_custom_model';
  const CHAT_WEB_VERIFY_STORAGE = 'gemini_chat_web_verify';

  const DEFAULT_CHAT_MODEL = 'gemini-3.8-flash';
  const BETTER_MODEL_RANK = [
    'gemini-3.1-pro-preview',
    'gemini-3.5-pro',
    'gemini-3.8-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
  ];

  let availableModels = [
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (Recommended · Reasoning & Free Tier)' },
    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Best Deep Reasoning · Paid Key)' },
    { id: 'gemini-3.5-pro', label: 'Gemini 3.5 Pro (Deep Reasoning · Paid Key)' },
    { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite (Fastest)' },
  ];

  const searchUnsupportedKeyIds = new Set();

  function getSlug() {
    return (document.title || 'guide')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  }

  function getChatHistoryStorageKey() {
    return 'study_ai_chats_' + getSlug();
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
      // ignore quota errors
    }
  }

  // =========================================================================
  // SHARED GEMINI BYOK KEY STORE (compatible with quiz-tools.js)
  // =========================================================================
  function loadApiKeys() {
    let list = loadJson(API_KEYS_LIST_STORAGE, []);
    if (!Array.isArray(list)) list = [];
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

  function notifyKeysUpdated() {
    window.dispatchEvent(new CustomEvent('gemini-keys-updated'));
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
    notifyKeysUpdated();
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
    notifyKeysUpdated();
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

  function maskKey(key) {
    if (!key) return '';
    if (key.length <= 8) return '••••';
    return key.slice(0, 4) + '••••' + key.slice(-4);
  }

  function getInitialChatModel() {
    try {
      const chatSaved = localStorage.getItem(CHAT_MODEL_STORAGE);
      if (chatSaved && chatSaved.trim()) return chatSaved.trim();
      const quizSaved = (localStorage.getItem(QUIZ_MODEL_STORAGE) || '').trim();
      if (quizSaved && /gemini/i.test(quizSaved) && !/flash-lite|^gemini-2\./i.test(quizSaved)) {
        return quizSaved;
      }
    } catch {
      // ignore
    }
    return DEFAULT_CHAT_MODEL;
  }

  function getStoredWebVerify() {
    try {
      const v = localStorage.getItem(CHAT_WEB_VERIFY_STORAGE);
      return v === null ? true : v === 'true';
    } catch {
      return true;
    }
  }

  // =========================================================================
  // DOMAIN DETECTION & SPECIALIZED TUTORING PROMPTS
  // =========================================================================
  function detectDomain() {
    const sig = (document.title + ' ' + window.location.pathname).toLowerCase();
    if (sig.includes('computer')) return 'computer';
    if (sig.includes('financial') || sig.includes('banking')) return 'finance';
    return 'general';
  }

  function getDomainLabel(domain) {
    if (domain === 'computer') return 'Computer IT';
    if (domain === 'finance') return 'Financial Awareness';
    return 'Study Guide';
  }

  function buildSystemInstruction(domain, ctx, webSearchAttempted) {
    const today = new Date().toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    const honestyRule = webSearchAttempted
      ? 'If live Google Search results were returned to you via the google_search tool, cross-verify recent numbers/specs/circulars and cite findings honestly. Never invent search results you did not retrieve.'
      : 'You are answering from your built-in knowledge (live Google Search is NOT attached to this request). Never pretend you live-browsed websites right now; explicitly advise confirming any fast-changing live circulars/rates where applicable.';

    const sharedContext = [
      'Current reference date: ' + today + '.',
      'Guide: ' + (document.title || 'IBPS RRB Scale 2 Study Guide') + '.',
      ctx && ctx.chapterTitle ? 'Chapter: ' + ctx.chapterTitle + '.' : '',
      ctx && ctx.subtopicTitle ? 'Subtopic: ' + ctx.subtopicTitle + '.' : '',
      ctx && ctx.surroundingBlockText
        ? 'Surrounding Guide Note/Row:\n"""\n' + ctx.surroundingBlockText + '\n"""'
        : '',
      honestyRule,
      'Keep explanations crisp, scannable in a sidebar chatbox, and deeply helpful so the learner truly understands the concept without needing external browsing.',
    ]
      .filter(Boolean)
      .join('\n');

    if (domain === 'computer') {
      return [
        'You are an expert Computer Science & IBPS RRB Scale 2 (IT Officer) tutor.',
        'The student highlighted a compressed term, acronym, or brief note from their Computer Knowledge master guide because it lacked enough explanation.',
        sharedContext,
        'When explaining a selected term for the first time, organize cleanly with:',
        '### 1. Core Concept & How It Works',
        'Explain in clear intuitive terms (2-4 crisp sentences or short bullets) what it is and the exact underlying mechanism.',
        '### 2. Concrete Example',
        'Give a short practical example (e.g., tiny SQL/code snippet, Linux command output, Excel formula trace, packet flow, binary/memory calculation, or everyday analogy).',
        '### 3. Exam Angles & Confusion Traps',
        'Highlight exact specs/numbers examiners test (OSI layer, port number, Big-O, IEEE 802 standard, 2026 MS Office/Windows behavior, "X vs Y" confusions).',
        '### 4. Content Fact-Check',
        'Check the selected snippet + surrounding guide line against authoritative CS/vendor standards (IEEE, RFC, W3C, Microsoft, Linux FHS): start with **Verified ✅**, **Nuance / Watch ⚠️**, or **Correction Needed ❌**, and state any fix concisely if needed.',
      ].join('\n\n');
    }

    if (domain === 'finance') {
      return [
        'You are an expert Indian Banking, Economics & IBPS RRB Scale 2 (IT / GBO) Financial Awareness tutor.',
        'The student highlighted a compressed term, scheme, rate, or brief line from their Financial Awareness master guide because it lacked enough background or clarity.',
        sharedContext,
        'When explaining a selected item for the first time, organize cleanly with:',
        '### 1. Plain-English Meaning & Purpose',
        'Explain clearly what it is, why RBI / Govt / SEBI created or uses it, and which regulator/body administers it.',
        '### 2. How It Works (Real Banking Flow)',
        'Show the practical mechanism, transaction/money flow, eligibility, or bank balance-sheet impact so the intuition sticks.',
        '### 3. Key Limits, Committees & Exam Traps',
        'Call out critical numbers, acts, establishment years, committees, and common IBPS close-option traps (old vs revised rules, PSB/Scheduled Bank vs RRB differences).',
        '### 4. Fact-Check & 2026 Currency Check',
        'Audit the snippet + surrounding guide note for factual & regulatory accuracy as of late 2026: start with **Verified ✅**, **Caution / Live-Rate Check ⚠️**, or **Correction Needed ❌**, noting clearly if rates/limits (e.g. MPC, small savings, UPI/RBI circulars) are dynamic or if anything appears inaccurate.',
      ].join('\n\n');
    }

    return [
      'You are an expert IBPS RRB Scale 2 exam tutor.',
      sharedContext,
      'Provide a clear intuitive explanation, concrete example, key exam takeaways/traps, and a concise fact-check verdict (**Verified ✅**, **Nuance ⚠️**, or **Correction Needed ❌**).',
    ].join('\n\n');
  }

  function buildInitialUserMessage(ctx) {
    const parts = ['Please explain this selected item clearly and fact-check it against the surrounding note:'];
    parts.push('Selection: "' + (ctx.selectedText || '').trim() + '"');
    if (ctx.chapterTitle) parts.push('Section: ' + ctx.chapterTitle + (ctx.subtopicTitle ? ' > ' + ctx.subtopicTitle : ''));
    if (ctx.tableHeaders) parts.push('Table Columns: ' + ctx.tableHeaders);
    if (ctx.surroundingBlockText) parts.push('Surrounding Guide Context: ' + ctx.surroundingBlockText);
    return parts.join('\n');
  }

  // =========================================================================
  // SAFE MARKDOWN RENDERER
  // =========================================================================
  function formatInlineMarkdown(escapedLine) {
    const codeTokens = [];
    let s = escapedLine.replace(/`([^`]+)`/g, (_, code) => {
      const idx = codeTokens.length;
      codeTokens.push('<code>' + code + '</code>');
      return '\u0000CODE' + idx + '\u0000';
    });

    // Safe external links [label](https://...)
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => {
      return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
    });

    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');

    s = s.replace(/\u0000CODE(\d+)\u0000/g, (_, idx) => codeTokens[Number(idx)] || '');
    return s;
  }

  function renderMarkdown(rawText) {
    if (!rawText) return '';
    const fenced = [];
    const normalized = String(rawText).replace(/\r\n/g, '\n');

    // Extract fenced code blocks before escaping rest
    const withPlaceholders = normalized.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const idx = fenced.length;
      fenced.push(
        '<pre><code>' + escapeHtml(code.replace(/\n$/, '')) + '</code></pre>'
      );
      return '\n\u0000FENCE' + idx + '\u0000\n';
    });

    const lines = escapeHtml(withPlaceholders).split('\n');
    const out = [];
    let i = 0;

    function isTableLine(line) {
      return /^\s*\|.+\|\s*$/.test(line);
    }

    function isTableSep(line) {
      return /^\s*\|[\s:-]+(?:\|[\s:-]+)*\|\s*$/.test(line);
    }

    function splitRow(line) {
      return line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim());
    }

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) {
        i++;
        continue;
      }

      const fenceMatch = trimmed.match(/^\u0000FENCE(\d+)\u0000$/);
      if (fenceMatch) {
        out.push(fenced[Number(fenceMatch[1])] || '');
        i++;
        continue;
      }

      // Headings
      const hMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (hMatch) {
        const level = Math.min(4, Math.max(2, hMatch[1].length));
        out.push('<h' + level + '>' + formatInlineMarkdown(hMatch[2]) + '</h' + level + '>');
        i++;
        continue;
      }

      // Markdown table
      if (i + 1 < lines.length && isTableLine(line) && isTableSep(lines[i + 1])) {
        const headers = splitRow(line);
        i += 2;
        const bodyRows = [];
        while (i < lines.length && isTableLine(lines[i])) {
          bodyRows.push(splitRow(lines[i]));
          i++;
        }
        let thtml = '<div class="ai-md-table-wrap"><table><thead><tr>';
        headers.forEach((h) => {
          thtml += '<th>' + formatInlineMarkdown(h) + '</th>';
        });
        thtml += '</tr></thead><tbody>';
        bodyRows.forEach((row) => {
          thtml += '<tr>';
          for (let c = 0; c < headers.length; c++) {
            thtml += '<td>' + formatInlineMarkdown(row[c] || '') + '</td>';
          }
          thtml += '</tr>';
        });
        thtml += '</tbody></table></div>';
        out.push(thtml);
        continue;
      }

      // Blockquote
      if (trimmed.startsWith('&gt;')) {
        const bqLines = [];
        while (i < lines.length && lines[i].trim().startsWith('&gt;')) {
          bqLines.push(lines[i].trim().replace(/^&gt;\s?/, ''));
          i++;
        }
        out.push('<blockquote>' + bqLines.map(formatInlineMarkdown).join('<br>') + '</blockquote>');
        continue;
      }

      // Unordered list
      if (/^[-*]\s+/.test(trimmed)) {
        const items = [];
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
          items.push('<li>' + formatInlineMarkdown(lines[i].trim().replace(/^[-*]\s+/, '')) + '</li>');
          i++;
        }
        out.push('<ul>' + items.join('') + '</ul>');
        continue;
      }

      // Ordered list
      if (/^\d+[.)]\s+/.test(trimmed)) {
        const items = [];
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
          items.push('<li>' + formatInlineMarkdown(lines[i].trim().replace(/^\d+[.)]\s+/, '')) + '</li>');
          i++;
        }
        out.push('<ol>' + items.join('') + '</ol>');
        continue;
      }

      // Paragraph (consume consecutive plain lines)
      const pLines = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        if (
          !t ||
          /^\u0000FENCE(\d+)\u0000$/.test(t) ||
          /^(#{1,4})\s+/.test(t) ||
          t.startsWith('&gt;') ||
          /^[-*]\s+/.test(t) ||
          /^\d+[.)]\s+/.test(t) ||
          (i + 1 < lines.length && isTableLine(lines[i]) && isTableSep(lines[i + 1]))
        ) {
          break;
        }
        pLines.push(formatInlineMarkdown(t));
        i++;
      }
      if (pLines.length > 0) {
        out.push('<p>' + pLines.join('<br>') + '</p>');
      }
    }

    return out.join('');
  }

  // =========================================================================
  // MAIN ASK AI SIDEBAR CONTROLLER
  // =========================================================================
  function initAiChat() {
    if (document.getElementById('aiChatSidebar')) return;

    const domain = detectDomain();
    const domainLabel = getDomainLabel(domain);

    const backdrop = document.createElement('div');
    backdrop.className = 'ai-backdrop';
    backdrop.id = 'aiChatBackdrop';

    const sidebar = document.createElement('aside');
    sidebar.className = 'ai-sidebar';
    sidebar.id = 'aiChatSidebar';
    sidebar.setAttribute('aria-label', 'Ask AI Study Tutor');

    sidebar.innerHTML =
      '<div class="ai-header">' +
      '  <div class="ai-header-left">' +
      '    <h2 class="ai-header-title">&#10024; Ask AI</h2>' +
      '    <span class="ai-domain-badge">' + escapeHtml(domainLabel) + '</span>' +
      '  </div>' +
      '  <div class="ai-header-actions">' +
      '    <button type="button" class="ai-icon-btn" id="aiHistToggleBtn" title="Recent AI chats">History</button>' +
      '    <button type="button" class="ai-icon-btn" id="aiSettingsToggleBtn" title="Gemini keys &amp; model settings">Key / Model</button>' +
      '    <button type="button" class="ai-icon-btn" id="aiNewChatBtn" title="Start new general chat">+ New</button>' +
      '    <button type="button" class="ai-icon-btn ai-close-btn" id="aiCloseBtn" aria-label="Close AI chat sidebar">&times;</button>' +
      '  </div>' +
      '</div>' +
      '<div class="ai-tray" id="aiSettingsTray" hidden></div>' +
      '<div class="ai-tray" id="aiHistoryTray" hidden></div>' +
      '<div class="ai-context-banner" id="aiContextBanner" hidden></div>' +
      '<div class="ai-messages" id="aiMessages"></div>' +
      '<div class="ai-suggestions" id="aiSuggestions" hidden></div>' +
      '<div class="ai-composer">' +
      '  <textarea class="ai-textarea" id="aiChatInput" rows="1" placeholder="Ask a follow-up or any topic question..."></textarea>' +
      '  <button type="button" class="ai-btn ai-btn-primary" id="aiChatSendBtn">Send</button>' +
      '</div>';

    document.body.appendChild(backdrop);
    document.body.appendChild(sidebar);

    const settingsTray = document.getElementById('aiSettingsTray');
    const historyTray = document.getElementById('aiHistoryTray');
    const settingsToggleBtn = document.getElementById('aiSettingsToggleBtn');
    const histToggleBtn = document.getElementById('aiHistToggleBtn');
    const newChatBtn = document.getElementById('aiNewChatBtn');
    const closeBtn = document.getElementById('aiCloseBtn');
    const contextBanner = document.getElementById('aiContextBanner');
    const messagesEl = document.getElementById('aiMessages');
    const suggestionsEl = document.getElementById('aiSuggestions');
    const chatInput = document.getElementById('aiChatInput');
    const sendBtn = document.getElementById('aiChatSendBtn');

    const state = {
      isOpen: false,
      showSettings: false,
      showHistory: false,
      showKeyForm: !getActiveKeyEntry(),
      useCustomModel: false,
      model: getInitialChatModel(),
      customModel: (function () {
        try { return localStorage.getItem(CHAT_CUSTOM_MODEL_STORAGE) || ''; } catch { return ''; }
      })(),
      webVerify: getStoredWebVerify(),
      threads: loadJson(getChatHistoryStorageKey(), []),
      activeThreadId: null,
      pendingExplainContext: null,
      isLoading: false,
      errorState: null, // { message, isFreeTierSearchError, isProTierError, retryText }
      abortController: null,
      snippetExpanded: false,
    };

    if (!Array.isArray(state.threads)) state.threads = [];
    if (state.threads.length > 0) {
      state.activeThreadId = state.threads[0].id;
    }

    function getActiveThread() {
      return state.threads.find((t) => t.id === state.activeThreadId) || null;
    }

    function saveThreads() {
      state.threads = state.threads.slice(0, 20);
      saveJson(getChatHistoryStorageKey(), state.threads);
    }

    function openSidebar() {
      state.isOpen = true;
      sidebar.classList.add('open');
      backdrop.classList.add('open');
      document.body.classList.add('ai-sidebar-open');
      if (!getActiveKeyEntry()) {
        state.showSettings = true;
        state.showKeyForm = true;
      }
      renderAll();
    }

    function closeSidebar() {
      state.isOpen = false;
      sidebar.classList.remove('open');
      backdrop.classList.remove('open');
      document.body.classList.remove('ai-sidebar-open');
    }

    // =========================================================================
    // RENDERERS
    // =========================================================================
    function renderSettingsTray() {
      settingsToggleBtn.classList.toggle('active', state.showSettings);
      settingsTray.hidden = !state.showSettings;
      if (!state.showSettings) return;

      const apiKeys = loadApiKeys();
      const activeKeyObj = getActiveKeyEntry(apiKeys);
      const hasCurrentModelInList =
        !state.useCustomModel && availableModels.some((m) => m.id === state.model);

      let html = '';
      html += '<div class="ai-tray-row" style="justify-content:space-between;">';
      html += '<strong style="font-size:12.5px;">Gemini API Token (' + apiKeys.length + ' saved)</strong>';
      if (apiKeys.length > 0 && !state.showKeyForm) {
        html +=
          '<div style="display:flex;gap:5px;">' +
          '<button type="button" class="ai-btn" id="aiAddKeyBtn">+ Add Key</button>' +
          '<button type="button" class="ai-btn" id="aiDelKeyBtn">Delete</button>' +
          '</div>';
      }
      html += '</div>';

      if (apiKeys.length > 0 && !state.showKeyForm) {
        html += '<div class="ai-tray-row">';
        html += '<select class="ai-select" id="aiActiveKeySelect" style="flex:1;width:100%;">';
        apiKeys.forEach((k) => {
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
            ') · ' +
            (k.requests || 0) +
            ' req / ' +
            toks.toLocaleString() +
            ' tok</option>';
        });
        html += '</select></div>';
      }

      if (apiKeys.length === 0 || state.showKeyForm) {
        html +=
          '<div class="ai-tray-row">' +
          '<input type="text" class="ai-input" id="aiKeyLabelInput" placeholder="Label (e.g. Primary)" style="flex:0 1 110px;min-width:95px;">' +
          '<input type="password" class="ai-input" id="aiKeyInput" placeholder="Paste Gemini API key (AIza...)">' +
          '</div>' +
          '<div class="ai-tray-row">' +
          '<button type="button" class="ai-btn ai-btn-primary" id="aiSaveKeyBtn">' +
          (state.pendingExplainContext ? 'Save &amp; Explain' : 'Save Key') +
          '</button>' +
          (apiKeys.length > 0 ? '<button type="button" class="ai-btn" id="aiCancelKeyBtn">Cancel</button>' : '') +
          '<span class="ai-muted">Shared locally with Mock Test.</span>' +
          '</div>';
      }

      html += '<div class="ai-tray-row" style="margin-top:2px;">';
      html += '<select class="ai-select" id="aiModelSelect" style="flex:1;">';
      availableModels.forEach((m) => {
        html +=
          '<option value="' +
          escapeHtml(m.id) +
          '"' +
          (state.model === m.id && !state.useCustomModel ? ' selected' : '') +
          '>' +
          escapeHtml(m.label) +
          '</option>';
      });
      html +=
        '<option value="__custom__"' +
        (!hasCurrentModelInList ? ' selected' : '') +
        '>Custom model ID...</option></select>';
      if (activeKeyObj) {
        html += '<button type="button" class="ai-btn" id="aiSyncModelsBtn" title="Fetch models for this key">Sync</button>';
      }
      html += '</div>';

      if (!hasCurrentModelInList) {
        html +=
          '<div class="ai-tray-row">' +
          '<input type="text" class="ai-input" id="aiCustomModelInput" placeholder="e.g. gemini-3.8-flash" value="' +
          escapeHtml(state.customModel || state.model) +
          '"></div>';
      }

      html +=
        '<div class="ai-tray-row" style="justify-content:space-between;">' +
        '<label class="ai-web-toggle"><input type="checkbox" id="aiWebVerifyCheck"' +
        (state.webVerify ? ' checked' : '') +
        '> Web Verify (Google Search)</label>' +
        '<span class="ai-muted">' +
        (state.webVerify
          ? 'Live Search on billed keys; auto-fallback on free keys'
          : 'Using model knowledge only') +
        '</span></div>';

      settingsTray.innerHTML = html;

      document.getElementById('aiActiveKeySelect')?.addEventListener('change', (e) => {
        setActiveKeyId(e.target.value);
        state.errorState = null;
        renderSettingsTray();
      });
      document.getElementById('aiAddKeyBtn')?.addEventListener('click', () => {
        state.showKeyForm = true;
        renderSettingsTray();
      });
      document.getElementById('aiCancelKeyBtn')?.addEventListener('click', () => {
        state.showKeyForm = false;
        renderSettingsTray();
      });
      document.getElementById('aiDelKeyBtn')?.addEventListener('click', () => {
        if (!activeKeyObj) return;
        deleteKeyEntry(activeKeyObj.id);
        if (loadApiKeys().length === 0) state.showKeyForm = true;
        renderSettingsTray();
      });
      document.getElementById('aiSaveKeyBtn')?.addEventListener('click', () => {
        const label = (document.getElementById('aiKeyLabelInput')?.value || '').trim();
        const val = (document.getElementById('aiKeyInput')?.value || '').trim();
        if (!val) {
          state.errorState = { message: 'Please enter a valid Gemini API key.' };
          renderMessages();
          return;
        }
        addKeyEntry(label, val);
        state.showKeyForm = false;
        state.errorState = null;
        if (state.pendingExplainContext) {
          const pending = state.pendingExplainContext;
          state.pendingExplainContext = null;
          state.showSettings = false;
          askSelection(pending);
        } else {
          renderAll();
        }
      });

      document.getElementById('aiModelSelect')?.addEventListener('change', (e) => {
        if (e.target.value === '__custom__') {
          state.useCustomModel = true;
          state.model = state.customModel || DEFAULT_CHAT_MODEL;
          renderSettingsTray();
          return;
        }
        state.useCustomModel = false;
        state.model = e.target.value;
        try { localStorage.setItem(CHAT_MODEL_STORAGE, state.model); } catch {}
        renderSettingsTray();
      });

      document.getElementById('aiCustomModelInput')?.addEventListener('input', (e) => {
        const val = e.target.value.trim().replace(/^models\//, '');
        state.customModel = val;
        if (val) {
          state.model = val;
          try {
            localStorage.setItem(CHAT_CUSTOM_MODEL_STORAGE, val);
            localStorage.setItem(CHAT_MODEL_STORAGE, val);
          } catch {}
        }
      });

      document.getElementById('aiSyncModelsBtn')?.addEventListener('click', async () => {
        const active = getActiveKeyEntry();
        if (!active) return;
        const btn = document.getElementById('aiSyncModelsBtn');
        if (btn) {
          btn.disabled = true;
          btn.textContent = '...';
        }
        try {
          const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
            headers: { 'x-goog-api-key': active.key },
          });
          if (!r.ok) throw new Error('Model sync failed (' + r.status + ')');
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
            if (!list.some((m) => m.id === state.model)) {
              const preferred =
                list.find((m) => BETTER_MODEL_RANK.includes(m.id)) || list[0];
              state.model = preferred.id;
              try { localStorage.setItem(CHAT_MODEL_STORAGE, state.model); } catch {}
            }
          }
          state.errorState = null;
        } catch (err) {
          state.errorState = { message: err.message || 'Could not sync Gemini models.' };
        }
        renderAll();
      });

      document.getElementById('aiWebVerifyCheck')?.addEventListener('change', (e) => {
        state.webVerify = e.target.checked;
        if (state.webVerify && activeKeyObj) {
          searchUnsupportedKeyIds.delete(activeKeyObj.id);
        }
        try { localStorage.setItem(CHAT_WEB_VERIFY_STORAGE, String(state.webVerify)); } catch {}
        renderSettingsTray();
      });
    }

    function renderHistoryTray() {
      histToggleBtn.classList.toggle('active', state.showHistory);
      historyTray.hidden = !state.showHistory;
      if (!state.showHistory) return;

      if (state.threads.length === 0) {
        historyTray.innerHTML = '<div class="ai-muted">No saved topic chats yet in this guide.</div>';
        return;
      }

      let html =
        '<div class="ai-tray-row" style="justify-content:space-between;">' +
        '<strong style="font-size:12.5px;">Recent Topics (' + state.threads.length + ')</strong>' +
        '<button type="button" class="ai-btn" id="aiClearHistoryBtn">Clear History</button>' +
        '</div>';

      state.threads.forEach((t) => {
        const isActive = t.id === state.activeThreadId;
        html +=
          '<div class="ai-hist-item' +
          (isActive ? ' active' : '') +
          '">' +
          '<button type="button" class="ai-hist-open" data-thread-id="' +
          escapeHtml(t.id) +
          '">' +
          '<div class="ai-hist-title">' +
          escapeHtml(t.title || 'Untitled topic') +
          '</div>' +
          '<div class="ai-hist-meta">' +
          escapeHtml(t.chapterLabel || domainLabel) +
          ' · ' +
          (t.messages ? t.messages.length : 0) +
          ' msg</div></button>' +
          '<button type="button" class="ai-hist-del" data-del-thread="' +
          escapeHtml(t.id) +
          '" aria-label="Delete chat">&times;</button>' +
          '</div>';
      });

      historyTray.innerHTML = html;

      document.getElementById('aiClearHistoryBtn')?.addEventListener('click', () => {
        state.threads = [];
        state.activeThreadId = null;
        saveThreads();
        renderAll();
      });

      historyTray.querySelectorAll('[data-thread-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.activeThreadId = btn.dataset.threadId;
          state.showHistory = false;
          state.errorState = null;
          state.snippetExpanded = false;
          renderAll();
        });
      });

      historyTray.querySelectorAll('[data-del-thread]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.delThread;
          state.threads = state.threads.filter((t) => t.id !== id);
          if (state.activeThreadId === id) {
            state.activeThreadId = state.threads[0] ? state.threads[0].id : null;
          }
          saveThreads();
          renderAll();
        });
      });
    }

    function renderContextBanner() {
      const thread = getActiveThread();
      const ctx = (thread && thread.context) || state.pendingExplainContext;
      if (!ctx || !ctx.selectedText) {
        contextBanner.hidden = true;
        return;
      }

      contextBanner.hidden = false;
      const locLabel = [ctx.chapterTitle, ctx.subtopicTitle].filter(Boolean).join(' · ') || domainLabel;
      const needsToggle = (ctx.selectedText || '').length > 110 || (ctx.surroundingBlockText || '').length > 120;

      let html =
        '<div class="ai-context-meta">' +
        '<span>' + escapeHtml(locLabel) + '</span>' +
        '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">' +
        (thread && thread.context && !state.isLoading
          ? '<button type="button" class="ai-context-toggle" id="aiRefreshExplainBtn" title="Re-generate explanation with current model &amp; settings">&#8635; Refresh</button>'
          : '') +
        (needsToggle
          ? '<button type="button" class="ai-context-toggle" id="aiContextToggleBtn">' +
            (state.snippetExpanded ? 'Less' : 'Full context') +
            '</button>'
          : '') +
        '</div></div>' +
        '<div class="ai-context-snippet' +
        (state.snippetExpanded ? ' expanded' : '') +
        '">' +
        escapeHtml(
          state.snippetExpanded && ctx.surroundingBlockText && ctx.surroundingBlockText !== ctx.selectedText
            ? ctx.selectedText + '\n\nContext: ' + ctx.surroundingBlockText
            : ctx.selectedText
        ) +
        '</div>';

      contextBanner.innerHTML = html;
      document.getElementById('aiRefreshExplainBtn')?.addEventListener('click', () => {
        if (thread && thread.context) {
          askSelection(thread.context, { forceRefresh: true });
        }
      });
      document.getElementById('aiContextToggleBtn')?.addEventListener('click', () => {
        state.snippetExpanded = !state.snippetExpanded;
        renderContextBanner();
      });
    }

    function renderMessages() {
      const thread = getActiveThread();
      const msgs = thread && Array.isArray(thread.messages) ? thread.messages : [];

      if (msgs.length === 0 && !state.isLoading && !state.errorState) {
        const hasPending = Boolean(state.pendingExplainContext);
        messagesEl.innerHTML =
          '<div class="ai-empty">' +
          (hasPending
            ? '<strong>Gemini API Key Needed</strong><br>Paste your saved or new Gemini key in Settings above and click <strong>Save &amp; Explain</strong> to expand this topic automatically.'
            : '<strong>Select any text in the guide and tap &#10024; Ask AI</strong><br>Get instant plain-English explanations, concrete examples, exam traps, and fact verification for compressed topics — or type any question below.') +
          '</div>';
        suggestionsEl.hidden = true;
        return;
      }

      let html = '';
      msgs.forEach((m, idx) => {
        if (m.role === 'user') {
          html += '<div class="ai-msg"><div class="ai-msg-user">' + escapeHtml(m.displayText || m.text) + '</div></div>';
          return;
        }

        const badgeClass = m.verifyMode === 'web-grounded' ? 'grounded' : m.verifyMode === 'model-fallback' ? 'warn' : '';
        const verifyLabel =
          m.verifyMode === 'web-grounded'
            ? 'Web Grounded'
            : m.verifyMode === 'model-fallback'
            ? 'Model Knowledge (Free Key)'
            : 'Model Knowledge';

        html += '<div class="ai-msg"><div class="ai-msg-assistant">';
        html +=
          '<div class="ai-msg-head">' +
          '<div class="ai-msg-badges">' +
          (m.model ? '<span class="ai-pill-tag">' + escapeHtml(m.model) + '</span>' : '') +
          '<span class="ai-pill-tag ' +
          badgeClass +
          '">' +
          escapeHtml(verifyLabel) +
          '</span>' +
          '</div>' +
          '<button type="button" class="ai-copy-btn" data-copy-idx="' +
          idx +
          '">Copy</button>' +
          '</div>';
        html += '<div class="ai-md">' + renderMarkdown(m.text) + '</div>';

        if (Array.isArray(m.sources) && m.sources.length > 0) {
          html += '<div class="ai-sources"><span class="ai-sources-label">Verified Web Sources</span><div class="ai-source-links">';
          m.sources.forEach((src) => {
            html +=
              '<a class="ai-source-chip" href="' +
              escapeHtml(src.uri) +
              '" target="_blank" rel="noopener noreferrer">' +
              escapeHtml(src.title || src.uri) +
              '</a>';
          });
          html += '</div></div>';
        }
        html += '</div></div>';
      });

      if (state.isLoading) {
        html +=
          '<div class="ai-loading">' +
          '<div class="ai-spinner"></div>' +
          '<span>Thinking with <strong>' +
          escapeHtml(state.model) +
          '</strong>...</span>' +
          '</div>';
      }

      if (state.errorState) {
        const apiKeys = loadApiKeys();
        const activeKey = getActiveKeyEntry(apiKeys);
        html += '<div class="ai-error-box">';
        html += '<div><strong>Error:</strong> ' + escapeHtml(state.errorState.message) + '</div>';
        html += '<div class="ai-recovery-row">';
        if (state.errorState.retryPrompt) {
          html += '<button type="button" class="ai-btn" id="aiRetryErrBtn">Retry</button>';
        }
        if (state.errorState.isProTierError && state.model !== DEFAULT_CHAT_MODEL) {
          html += '<button type="button" class="ai-btn ai-btn-primary" id="aiSwitchFlashBtn">Use Gemini 3.8 Flash &amp; Retry</button>';
        }
        if (apiKeys.length > 1) {
          apiKeys
            .filter((k) => !activeKey || k.id !== activeKey.id)
            .slice(0, 2)
            .forEach((k) => {
              html +=
                '<button type="button" class="ai-btn" data-switch-key="' +
                escapeHtml(k.id) +
                '">Try ' +
                escapeHtml(k.label) +
                '</button>';
            });
        }
        html += '</div></div>';
      }

      messagesEl.innerHTML = html;
      messagesEl.scrollTop = messagesEl.scrollHeight;

      // Quick follow-up suggestions after a completed assistant reply
      const lastMsg = msgs[msgs.length - 1];
      if (!state.isLoading && lastMsg && lastMsg.role === 'model') {
        const chips =
          domain === 'computer'
            ? [
                'Compare with similar term',
                'Give 2 IBPS IT MCQs',
                'Simple everyday analogy',
                'Double-check numbers & specs',
              ]
            : domain === 'finance'
            ? [
                'Compare old vs 2026 rule',
                'Give 2 IBPS exam MCQs',
                'Practical bank example',
                'Verify 2026 numbers / traps',
              ]
            : ['Simple analogy', 'Give 2 exam MCQs', 'Verify key facts'];

        suggestionsEl.innerHTML = chips
          .map(
            (c) =>
              '<button type="button" class="ai-sugg-chip" data-sugg="' +
              escapeHtml(c) +
              '">' +
              escapeHtml(c) +
              '</button>'
          )
          .join('');
        suggestionsEl.hidden = false;
      } else {
        suggestionsEl.hidden = true;
      }

      messagesEl.querySelectorAll('[data-copy-idx]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const m = msgs[Number(btn.dataset.copyIdx)];
          if (!m) return;
          navigator.clipboard?.writeText(m.text).then(
            () => {
              btn.textContent = 'Copied!';
              setTimeout(() => {
                if (btn.isConnected) btn.textContent = 'Copy';
              }, 1500);
            },
            () => {}
          );
        });
      });

      document.getElementById('aiRetryErrBtn')?.addEventListener('click', () => {
        const retryPrompt = state.errorState?.retryPrompt;
        const retryCtx = state.errorState?.retryCtx;
        state.errorState = null;
        if (retryCtx) askSelection(retryCtx, { reuseEmptyThread: true });
        else if (retryPrompt) sendFollowUp(retryPrompt, { isRetry: true });
      });

      document.getElementById('aiSwitchFlashBtn')?.addEventListener('click', () => {
        const retryPrompt = state.errorState?.retryPrompt;
        const retryCtx = state.errorState?.retryCtx;
        state.model = DEFAULT_CHAT_MODEL;
        state.useCustomModel = false;
        try { localStorage.setItem(CHAT_MODEL_STORAGE, state.model); } catch {}
        state.errorState = null;
        if (retryCtx) askSelection(retryCtx, { reuseEmptyThread: true });
        else if (retryPrompt) sendFollowUp(retryPrompt, { isRetry: true });
      });

      messagesEl.querySelectorAll('[data-switch-key]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const retryPrompt = state.errorState?.retryPrompt;
          const retryCtx = state.errorState?.retryCtx;
          setActiveKeyId(btn.dataset.switchKey);
          state.errorState = null;
          if (retryCtx) askSelection(retryCtx, { reuseEmptyThread: true });
          else if (retryPrompt) sendFollowUp(retryPrompt, { isRetry: true });
        });
      });
    }

    function updateComposerUI() {
      if (state.isLoading) {
        sendBtn.textContent = 'Stop';
        sendBtn.classList.remove('ai-btn-primary');
      } else {
        sendBtn.textContent = 'Send';
        sendBtn.classList.add('ai-btn-primary');
      }
    }

    function renderAll() {
      renderSettingsTray();
      renderHistoryTray();
      renderContextBanner();
      renderMessages();
      updateComposerUI();
    }

    // =========================================================================
    // GEMINI API REQUEST WITH GROUNDED SEARCH + GRACEFUL FREE-TIER FALLBACK
    // =========================================================================
    async function callGeminiChat(keyEntry, systemInstruction, apiContents, signal) {
      const endpoint =
        'https://generativelanguage.googleapis.com/v1beta/models/' +
        encodeURIComponent(state.model) +
        ':generateContent';

      const tryWithSearch =
        state.webVerify && !searchUnsupportedKeyIds.has(keyEntry.id);

      async function doFetch(withSearch) {
        const body = {
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: apiContents,
          generationConfig: {
            temperature: 0.35,
          },
        };
        if (withSearch) {
          body.tools = [{ google_search: {} }];
        }

        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': keyEntry.key,
          },
          body: JSON.stringify(body),
          signal,
        });

        let json = null;
        try {
          json = await resp.json();
        } catch {
          json = null;
        }
        return { resp, json };
      }

      let usedSearch = tryWithSearch;
      let usedFallback = false;
      let result = await doFetch(tryWithSearch);

      if (!result.resp.ok && tryWithSearch) {
        const msg = result.json?.error?.message || '';
        const status = result.resp.status;
        const looksInvalidKey = /api key not valid|api_key_invalid|expired/i.test(msg);
        const looksLikeToolOrFreeTierBlock =
          !looksInvalidKey &&
          (status === 400 || status === 403 || status === 429) &&
          /search|grounding|google_search|tool|billing|free tier|quota|not enabled|not supported/i.test(msg);

        if (looksLikeToolOrFreeTierBlock) {
          searchUnsupportedKeyIds.add(keyEntry.id);
          usedSearch = false;
          usedFallback = true;
          result = await doFetch(false);
        }
      }

      if (!result.resp.ok) {
        const msg = result.json?.error?.message || 'Gemini API error (' + result.resp.status + ')';
        const err = new Error(msg);
        err.status = result.resp.status;
        throw err;
      }

      const data = result.json || {};
      recordKeyUsage(keyEntry.id, data.usageMetadata);

      const cand = data.candidates?.[0];
      const parts = cand?.content?.parts || [];
      const text = parts
        .map((p) => (typeof p.text === 'string' ? p.text : ''))
        .join('')
        .trim();
      if (!text) throw new Error('Gemini returned an empty response. Try again.');

      const chunks = cand?.groundingMetadata?.groundingChunks || [];
      const sourcesMap = new Map();
      chunks.forEach((c) => {
        const uri = c?.web?.uri;
        if (uri && /^https?:\/\//i.test(uri) && !sourcesMap.has(uri)) {
          sourcesMap.set(uri, { uri, title: c.web.title || uri });
        }
      });

      const verifyMode =
        sourcesMap.size > 0 || (usedSearch && cand?.groundingMetadata)
          ? 'web-grounded'
          : usedFallback
          ? 'model-fallback'
          : 'model';

      return {
        text,
        sources: Array.from(sourcesMap.values()).slice(0, 6),
        verifyMode,
      };
    }

    function classifyError(err, retryInfo) {
      const msg = err?.message || 'Request failed.';
      const isProTierError =
        /free tier|not available|billing|3\.1-pro|3\.5-pro/i.test(msg) &&
        state.model !== DEFAULT_CHAT_MODEL;
      return {
        message: msg,
        isProTierError,
        retryPrompt: retryInfo.retryPrompt || '',
        retryCtx: retryInfo.retryCtx || null,
      };
    }

    // =========================================================================
    // ACTIONS: EXPLAIN SELECTION & FOLLOW-UP CHAT
    // =========================================================================
    async function askSelection(ctx, opts = {}) {
      if (!ctx || !ctx.selectedText) return;
      openSidebar();

      const normSel = ctx.selectedText.replace(/\s+/g, ' ').trim();
      const normChap = ctx.chapterId || '';

      // Reuse completed thread on repeat clicks unless explicitly refreshed
      if (!opts.forceRefresh && !opts.reuseEmptyThread) {
        const existingIdx = state.threads.findIndex(
          (t) =>
            t.context &&
            t.context.selectedText &&
            t.context.selectedText.replace(/\s+/g, ' ').trim() === normSel &&
            (t.context.chapterId || '') === normChap &&
            Array.isArray(t.messages) &&
            t.messages.some((m) => m.role === 'model')
        );
        if (existingIdx !== -1) {
          const [existing] = state.threads.splice(existingIdx, 1);
          state.threads.unshift(existing);
          state.activeThreadId = existing.id;
          state.pendingExplainContext = null;
          state.showSettings = false;
          state.showHistory = false;
          state.errorState = null;
          state.snippetExpanded = false;
          saveThreads();
          renderAll();
          return;
        }
      }

      const activeKey = getActiveKeyEntry();
      if (!activeKey) {
        state.pendingExplainContext = ctx;
        state.showSettings = true;
        state.showKeyForm = true;
        state.errorState = null;
        renderAll();
        return;
      }

      if (state.abortController) {
        state.abortController.abort();
      }
      state.abortController = new AbortController();

      state.pendingExplainContext = null;
      state.showSettings = false;
      state.showHistory = false;
      state.errorState = null;
      state.snippetExpanded = false;

      let thread = opts.reuseEmptyThread ? getActiveThread() : null;
      if (!thread) {
        const cleanTitle = ctx.selectedText.replace(/\s+/g, ' ').trim().slice(0, 58);
        thread = {
          id: 'ai_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5),
          title: cleanTitle || 'Selected Topic',
          chapterLabel: ctx.chapterTitle || domainLabel,
          context: ctx,
          messages: [],
        };
        state.threads.unshift(thread);
        state.activeThreadId = thread.id;
      }

      const apiPrompt = buildInitialUserMessage(ctx);
      const cleanSel = ctx.selectedText.replace(/\s+/g, ' ').trim();
      const displayLabel =
        cleanSel.length > 140
          ? 'Explain & verify: "' + cleanSel.slice(0, 140) + '..."'
          : 'Explain & verify: "' + cleanSel + '"';

      if (!opts.reuseEmptyThread || thread.messages.length === 0) {
        thread.messages.push({
          role: 'user',
          text: apiPrompt,
          displayText: displayLabel,
        });
      }

      saveThreads();
      state.isLoading = true;
      renderAll();

      try {
        const sysPrompt = buildSystemInstruction(
          domain,
          ctx,
          state.webVerify && !searchUnsupportedKeyIds.has(activeKey.id)
        );
        const apiContents = thread.messages.map((m) => ({
          role: m.role,
          parts: [{ text: m.text }],
        }));

        const reply = await callGeminiChat(
          activeKey,
          sysPrompt,
          apiContents,
          state.abortController.signal
        );

        thread.messages.push({
          role: 'model',
          text: reply.text,
          model: state.model,
          verifyMode: reply.verifyMode,
          sources: reply.sources,
        });
        saveThreads();
      } catch (err) {
        if (err.name === 'AbortError') return;
        // Keep failed prompt easy to retry without duplicating user bubble
        state.errorState = classifyError(err, { retryCtx: ctx });
      } finally {
        state.isLoading = false;
        state.abortController = null;
        renderAll();
      }
    }

    async function sendFollowUp(rawText, opts = {}) {
      const prompt = (rawText || '').trim();
      if (!prompt) return;

      const activeKey = getActiveKeyEntry();
      if (!activeKey) {
        state.showSettings = true;
        state.showKeyForm = true;
        state.errorState = { message: 'Please save a Gemini API key first.' };
        renderAll();
        return;
      }

      if (state.abortController) {
        state.abortController.abort();
      }
      state.abortController = new AbortController();
      state.errorState = null;

      let thread = getActiveThread();
      if (!thread) {
        thread = {
          id: 'ai_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5),
          title: prompt.slice(0, 58),
          chapterLabel: domainLabel,
          context: null,
          messages: [],
        };
        state.threads.unshift(thread);
        state.activeThreadId = thread.id;
      }

      if (!opts.isRetry) {
        thread.messages.push({
          role: 'user',
          text: prompt,
          displayText: prompt,
        });
        if (thread.title === 'New Chat') {
          thread.title = prompt.slice(0, 58);
        }
        saveThreads();
      }

      state.isLoading = true;
      renderAll();

      try {
        const sysPrompt = buildSystemInstruction(
          domain,
          thread.context,
          state.webVerify && !searchUnsupportedKeyIds.has(activeKey.id)
        );
        const apiContents = thread.messages.map((m) => ({
          role: m.role,
          parts: [{ text: m.text }],
        }));

        const reply = await callGeminiChat(
          activeKey,
          sysPrompt,
          apiContents,
          state.abortController.signal
        );

        thread.messages.push({
          role: 'model',
          text: reply.text,
          model: state.model,
          verifyMode: reply.verifyMode,
          sources: reply.sources,
        });
        saveThreads();
      } catch (err) {
        if (err.name === 'AbortError') return;
        state.errorState = classifyError(err, { retryPrompt: prompt });
      } finally {
        state.isLoading = false;
        state.abortController = null;
        renderAll();
      }
    }

    function startNewGeneralChat() {
      if (state.abortController) state.abortController.abort();
      state.isLoading = false;
      state.errorState = null;
      state.pendingExplainContext = null;
      state.showHistory = false;
      state.activeThreadId = null;
      openSidebar();
      chatInput.focus();
    }

    // =========================================================================
    // EVENT LISTENERS
    // =========================================================================
    settingsToggleBtn.addEventListener('click', () => {
      state.showSettings = !state.showSettings;
      if (state.showSettings) state.showHistory = false;
      renderAll();
    });

    histToggleBtn.addEventListener('click', () => {
      state.showHistory = !state.showHistory;
      if (state.showHistory) state.showSettings = false;
      renderAll();
    });

    newChatBtn.addEventListener('click', () => {
      startNewGeneralChat();
    });

    closeBtn.addEventListener('click', closeSidebar);
    backdrop.addEventListener('click', closeSidebar);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.isOpen) {
        const qzBackdrop = document.getElementById('qzBackdrop');
        if (!qzBackdrop || !qzBackdrop.classList.contains('open')) {
          closeSidebar();
        }
      }
    });

    suggestionsEl.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-sugg]');
      if (!chip || state.isLoading) return;
      sendFollowUp(chip.dataset.sugg);
    });

    function autoResizeTextarea() {
      chatInput.style.height = 'auto';
      chatInput.style.height = Math.min(120, Math.max(38, chatInput.scrollHeight)) + 'px';
    }

    chatInput.addEventListener('input', autoResizeTextarea);

    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!state.isLoading && chatInput.value.trim()) {
          const val = chatInput.value;
          chatInput.value = '';
          autoResizeTextarea();
          sendFollowUp(val);
        }
      }
    });

    sendBtn.addEventListener('click', () => {
      if (state.isLoading) {
        if (state.abortController) state.abortController.abort();
        state.isLoading = false;
        state.abortController = null;
        renderAll();
        return;
      }
      const val = chatInput.value.trim();
      if (!val) return;
      chatInput.value = '';
      autoResizeTextarea();
      sendFollowUp(val);
    });

    window.addEventListener('gemini-keys-updated', () => {
      if (state.showSettings) renderSettingsTray();
    });

    window.addEventListener('storage', (e) => {
      if (
        e.key === API_KEYS_LIST_STORAGE ||
        e.key === ACTIVE_KEY_ID_STORAGE ||
        e.key === API_KEY_STORAGE
      ) {
        if (state.showSettings) renderSettingsTray();
      }
    });

    window.StudyAiChat = {
      askSelection,
      open: openSidebar,
      close: closeSidebar,
      newChat: startNewGeneralChat,
    };

    const aiFooterRow = document.getElementById('guideAiFooterRow');
    if (aiFooterRow) aiFooterRow.hidden = false;

    renderAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAiChat);
  } else {
    initAiChat();
  }
})();
