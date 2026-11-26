(function () {
  'use strict';

  const SUPPORTS_CUSTOM_HL =
    typeof CSS !== 'undefined' &&
    'highlights' in CSS &&
    typeof Highlight === 'function';

  const HL_COLORS = {
    'hl-yellow': { label: 'Yellow', meaning: 'Key Fact / Formula', short: 'Key', swatch: 'yellow' },
    'hl-red': { label: 'Red', meaning: 'Weak / Revise Again', short: 'Weak', swatch: 'red' },
    'hl-green': { label: 'Green', meaning: 'Mastered', short: 'Done', swatch: 'green' },
  };

  const GLOSSARY_ABBR_EXPANSIONS = {
    'corp.': 'corporation',
    corp: 'corporation',
    'dev.': 'development',
    dev: 'development',
    mgmt: 'management',
    acc: 'account',
    'ins.': 'insurance',
    ins: 'insurance',
    info: 'information',
    agri: 'agriculture',
    'rec.': 'recognition',
    sec: 'second',
    'fed.': 'federation',
    'ind.': 'industry',
    'auth.': 'authority',
    'reg.': 'regulation',
    sys: 'system',
    'prog.': 'programme',
    'gen.': 'generation',
    cert: 'certificate',
    'comm.': 'commission',
    org: 'organisation',
    soc: 'society',
    co: 'company',
    'assoc.': 'association',
    'int.': 'international',
    tech: 'technology',
    'ed.': 'education',
    'fin.': 'financial',
    'telecomm.': 'telecommunication',
    'eng.': 'engineers',
    'inst.': 'institute',
    ops: 'operations',
    config: 'configuration',
    adv: 'advanced',
    'adv.': 'advanced',
    inv: 'investment',
    'inv.': 'investment',
  };

  const STOPWORDS = new Set(['of', 'for', 'and', 'the', 'in', 'to', 'on', 'by', 'with', 'a', 'an']);

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function expandCommonWords(str) {
    return str
      .toLowerCase()
      .replace(/\s*\([^)]*\)/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .map((w) => GLOSSARY_ABBR_EXPANSIONS[w] || w.replace(/\.$/, ''))
      .join(' ')
      .trim();
  }

  function normalizePhrase(str) {
    return expandCommonWords(str)
      .replace(/[^a-z0-9%\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function contentWords(str) {
    return normalizePhrase(str)
      .split(' ')
      .filter((w) => w && !STOPWORDS.has(w));
  }

  function levenshtein(a, b) {
    const la = a.length;
    const lb = b.length;
    if (Math.abs(la - lb) > 1) return 2;
    if (a === b) return 0;
    const dp = new Array(lb + 1);
    for (let j = 0; j <= lb; j++) dp[j] = j;
    for (let i = 1; i <= la; i++) {
      let prev = dp[0];
      dp[0] = i;
      for (let j = 1; j <= lb; j++) {
        const temp = dp[j];
        if (a[i - 1] === b[j - 1]) {
          dp[j] = prev;
        } else {
          dp[j] = 1 + Math.min(prev, dp[j], dp[j - 1]);
        }
        prev = temp;
      }
    }
    return dp[lb];
  }

  // =========================================================================
  // 1. AUTO-GLOSSARY SYNONYM MAP
  // =========================================================================
  function buildGlossaryMap() {
    const abbrToFull = new Map(); // abbrLower -> Set<fullPhrase>
    const fullEntries = []; // { abbrs: string[], fullNorm: string, fullWords: string[] }

    const glossarySec = document.getElementById('glossary');
    if (!glossarySec) return { abbrToFull, fullEntries };

    const rows = glossarySec.querySelectorAll('tbody tr');
    rows.forEach((tr) => {
      const cells = tr.querySelectorAll('td');
      for (let i = 0; i + 1 < cells.length; i += 2) {
        const rawAbbrCell = cells[i].textContent.trim();
        const rawFullCell = cells[i + 1].textContent.trim();
        if (!rawAbbrCell || !rawFullCell) continue;

        const abbrParts = rawAbbrCell.split(/\s+\/\s+/).map((s) => s.trim()).filter(Boolean);
        const fullParts = rawFullCell.split(/\s+\/\s+/).map((s) => s.trim()).filter(Boolean);

        abbrParts.forEach((abbr, idx) => {
          const abbrLower = abbr.toLowerCase();
          if (abbrLower.length < 2) return;

          // Match corresponding full part when counts align, else share full form
          let fullRaw = fullParts[idx] || fullParts[0] || '';
          if (!fullRaw) return;

          // Handle shared suffix patterns like "Very / Ultra Large Scale Integration"
          if (
            abbrParts.length === fullParts.length &&
            fullParts.length > 1 &&
            idx < fullParts.length - 1 &&
            fullRaw.split(/\s+/).length === 1 &&
            fullParts[fullParts.length - 1].split(/\s+/).length > 1
          ) {
            const tailWords = fullParts[fullParts.length - 1].split(/\s+/).slice(1).join(' ');
            fullRaw = fullRaw + ' ' + tailWords;
          }

          // Handle shared prefix patterns like "PM Jan Dhan / Suraksha Bima / Jeevan Jyoti Bima Yojana"
          if (
            abbrParts.length === fullParts.length &&
            fullParts.length > 1 &&
            idx > 0 &&
            abbr.startsWith('PM') &&
            fullParts[0].startsWith('PM ') &&
            !fullRaw.startsWith('PM ')
          ) {
            fullRaw = 'PM ' + fullRaw;
            if (!fullRaw.toLowerCase().includes('yojana') && fullParts[fullParts.length - 1].toLowerCase().includes('yojana')) {
              fullRaw = fullRaw + ' Yojana';
            }
          }

          const cleanRaw = fullRaw.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
          const expanded = expandCommonWords(fullRaw);
          const normFull = normalizePhrase(fullRaw);

          if (!abbrToFull.has(abbrLower)) abbrToFull.set(abbrLower, new Set());
          const set = abbrToFull.get(abbrLower);
          if (cleanRaw.length >= 3) set.add(cleanRaw.toLowerCase());
          if (expanded.length >= 3) set.add(expanded);
          if (normFull.length >= 3) set.add(normFull);

          const cWords = contentWords(fullRaw);
          if (cWords.length >= 1) {
            fullEntries.push({
              abbr: abbrLower,
              fullNorm: normFull,
              contentWords: cWords,
            });
          }
        });
      }
    });

    return { abbrToFull, fullEntries };
  }

  function findGlossaryAbbrsForQuery(query, fullEntries) {
    const qNorm = normalizePhrase(query);
    if (!qNorm || qNorm.length < 4) return [];
    const qWords = contentWords(query);
    const matchedAbbrs = new Set();

    for (const entry of fullEntries) {
      if (qNorm === entry.fullNorm) {
        matchedAbbrs.add(entry.abbr);
        continue;
      }
      if (qWords.length >= 2 && entry.contentWords.length >= 2) {
        let hits = 0;
        for (const qw of qWords) {
          if (entry.contentWords.some((ew) => ew === qw || (qw.length >= 4 && levenshtein(ew, qw) <= 1))) {
            hits++;
          }
        }
        const coverage = hits / Math.max(entry.contentWords.length, qWords.length);
        if (hits >= 2 && coverage >= 0.65) {
          matchedAbbrs.add(entry.abbr);
        }
      }
    }
    return Array.from(matchedAbbrs);
  }

  // =========================================================================
  // 2. TEXT-NODE EXTRACTION & RANGE MAPPING
  // =========================================================================
  function getSearchRoot() {
    return document.querySelector('main') || document.body;
  }

  function shouldSkipElement(el) {
    if (!el) return true;
    if (
      el.closest(
        'header.hero, .st-search-controls, .hl-toolbar, .hl-drawer, .hl-drawer-backdrop, .guide-sidebar, .guide-mobile-bar, .sticky-nav, nav, script, style, noscript, input, textarea, select, button'
      )
    ) {
      return true;
    }
    return false;
  }

  function collectTextModel(container) {
    const segments = [];
    let fullText = '';
    let lastBlockCell = null;

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent || shouldSkipElement(parent)) return NodeFilter.FILTER_REJECT;
        if (parent.closest('.st-focus-hidden, .hidden-card')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let node;
    while ((node = walker.nextNode())) {
      const parentBlock = node.parentElement.closest('td, th, li, p, div, summary, h1, h2, h3, h4');
      if (lastBlockCell && parentBlock && parentBlock !== lastBlockCell && fullText && !/\s$/.test(fullText)) {
        fullText += ' ';
      }
      lastBlockCell = parentBlock;

      const start = fullText.length;
      const val = node.nodeValue;
      fullText += val;
      const end = fullText.length;
      segments.push({ node, start, end });
    }

    return { fullText, segments };
  }

  function createRangeFromOffsets(segments, startIdx, endIdx) {
    let startNode = null;
    let startOffset = 0;
    let endNode = null;
    let endOffset = 0;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (!startNode && startIdx < seg.end) {
        if (startIdx >= seg.start) {
          startNode = seg.node;
          startOffset = startIdx - seg.start;
        } else {
          // Fell in virtual space gap before this segment
          startNode = seg.node;
          startOffset = 0;
        }
      }
      if (endIdx <= seg.end) {
        if (endIdx > seg.start) {
          endNode = seg.node;
          endOffset = endIdx - seg.start;
        } else if (i > 0) {
          endNode = segments[i - 1].node;
          endOffset = segments[i - 1].end - segments[i - 1].start;
        }
        break;
      }
    }

    if (!startNode || !endNode) return null;
    try {
      const range = document.createRange();
      range.setStart(startNode, Math.max(0, startOffset));
      range.setEnd(endNode, Math.max(0, endOffset));
      if (range.collapsed) return null;
      return range;
    } catch {
      return null;
    }
  }

  // Find all match spans [start, end] in model.fullText for a single term or phrase
  function findTermSpans(fullTextLower, termLower, allowFuzzy) {
    const spans = [];
    if (!termLower) return spans;

    // 1. Exact substring match (with reasonable boundary handling when term is 2-char abbr? No, spec asks for substring)
    let idx = 0;
    while (idx <= fullTextLower.length) {
      const found = fullTextLower.indexOf(termLower, idx);
      if (found === -1) break;
      spans.push([found, found + termLower.length]);
      idx = found + Math.max(1, termLower.length);
    }

    // 2. Typo tolerance (Levenshtein <= 1 for tokens >= 4 chars, not pure numbers)
    if (
      allowFuzzy &&
      termLower.length >= 4 &&
      !/\s/.test(termLower) &&
      /[a-z]{2,}/i.test(termLower)
    ) {
      const wordRe = /[a-z0-9%]+/gi;
      let m;
      while ((m = wordRe.exec(fullTextLower))) {
        const w = m[0];
        if (w.length < 3 || /^\d+$/.test(w)) continue;
        if (Math.abs(w.length - termLower.length) > 1) continue;
        const wStart = m.index;
        const wEnd = wStart + w.length;
        // Skip if already covered by an exact match
        const alreadyCovered = spans.some(([s, e]) => wStart >= s && wEnd <= e);
        if (alreadyCovered) continue;
        if (levenshtein(w, termLower) <= 1) {
          spans.push([wStart, wEnd]);
        }
      }
    }

    return spans;
  }

  // Evaluate a block against token groups: each group is an array of alternative phrases (e.g. ["npci", "national payments corporation of india"])
  function matchBlockWithTokenGroups(model, tokenGroups, wholePhraseAlternatives) {
    const textLower = model.fullText.toLowerCase();
    const matchedSpans = [];

    // Check whole-phrase alternatives first (e.g. "National Payments Corporation of India" -> "npci")
    let wholeMatch = false;
    if (wholePhraseAlternatives && wholePhraseAlternatives.length > 0) {
      for (const alt of wholePhraseAlternatives) {
        const spans = findTermSpans(textLower, alt, false);
        if (spans.length > 0) {
          wholeMatch = true;
          matchedSpans.push(...spans);
        }
      }
    }

    // Check AND logic across all tokenGroups
    let allGroupsMatched = tokenGroups.length > 0;
    const tokenSpans = [];
    for (const group of tokenGroups) {
      let groupMatched = false;
      for (let gIdx = 0; gIdx < group.length; gIdx++) {
        const variant = group[gIdx];
        const allowFuzzy = gIdx === 0; // fuzzy only on user's literal token
        const spans = findTermSpans(textLower, variant, allowFuzzy);
        if (spans.length > 0) {
          groupMatched = true;
          tokenSpans.push(...spans);
        }
      }
      if (!groupMatched) {
        allGroupsMatched = false;
        break;
      }
    }

    if (allGroupsMatched) {
      matchedSpans.push(...tokenSpans);
    } else if (!wholeMatch) {
      return [];
    }

    // Deduplicate & sort spans
    matchedSpans.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
    const unique = [];
    for (const sp of matchedSpans) {
      const prev = unique[unique.length - 1];
      if (!prev || sp[0] >= prev[1]) {
        unique.push(sp);
      } else if (sp[1] > prev[1]) {
        prev[1] = sp[1];
      }
    }
    return unique;
  }

  // =========================================================================
  // 3. RESILIENT ANCHORING FOR USER HIGHLIGHTS
  // =========================================================================
  function getElementPath(node, root) {
    const path = [];
    let curr = node;
    while (curr && curr !== root) {
      const parent = curr.parentNode;
      if (!parent) return null;
      const idx = Array.prototype.indexOf.call(parent.childNodes, curr);
      path.unshift(idx);
      curr = parent;
    }
    return curr === root ? path : null;
  }

  function resolveElementPath(path, root) {
    if (!Array.isArray(path)) return null;
    let curr = root;
    for (const idx of path) {
      if (!curr || !curr.childNodes || idx < 0 || idx >= curr.childNodes.length) {
        return null;
      }
      curr = curr.childNodes[idx];
    }
    return curr;
  }

  function getContextAroundRange(range, root) {
    const startEl =
      range.startContainer.nodeType === 3
        ? range.startContainer.parentElement
        : range.startContainer;
    const endEl =
      range.endContainer.nodeType === 3 ? range.endContainer.parentElement : range.endContainer;
    const startCard = startEl.closest('section.card');
    const endCard = endEl.closest('section.card');
    const block = startCard && startCard === endCard ? startCard : root;
    const model = collectTextModel(block);
    const full = model.fullText;

    // Locate start & end offsets inside block model
    let absStart = -1;
    let absEnd = -1;
    for (const seg of model.segments) {
      if (seg.node === range.startContainer) {
        absStart = seg.start + range.startOffset;
      }
      if (seg.node === range.endContainer) {
        absEnd = seg.start + range.endOffset;
      }
    }
    if (absStart === -1 || absEnd === -1 || absEnd < absStart) {
      return { prefix: '', suffix: '' };
    }
    return {
      prefix: full.slice(Math.max(0, absStart - 20), absStart),
      suffix: full.slice(absEnd, Math.min(full.length, absEnd + 20)),
    };
  }

  function resolveHighlightAnchor(hl, root) {
    // Tier 1: Exact path + offset + text verification
    const startNode = resolveElementPath(hl.startPath, root);
    const endNode = resolveElementPath(hl.endPath, root);
    if (startNode && endNode && startNode.nodeType === 3 && endNode.nodeType === 3) {
      if (
        hl.startOffset <= startNode.nodeValue.length &&
        hl.endOffset <= endNode.nodeValue.length
      ) {
        try {
          const r = document.createRange();
          r.setStart(startNode, hl.startOffset);
          r.setEnd(endNode, hl.endOffset);
          if (r.toString() === hl.text) {
            return r;
          }
        } catch {
          // fall through to context search
        }
      }
    }

    // Tier 2 & 3: Context search within chapterId, then whole root
    const containers = [];
    if (hl.chapterId) {
      const chap = document.getElementById(hl.chapterId);
      if (chap) containers.push(chap);
    }
    containers.push(root);

    const targetText = hl.text || '';
    if (!targetText) return null;

    for (const container of containers) {
      const model = collectTextModel(container);
      const full = model.fullText;

      // Exact prefix + text + suffix
      if (hl.prefix || hl.suffix) {
        const needle = (hl.prefix || '') + targetText + (hl.suffix || '');
        const idx = full.indexOf(needle);
        if (idx !== -1) {
          const s = idx + (hl.prefix ? hl.prefix.length : 0);
          const r = createRangeFromOffsets(model.segments, s, s + targetText.length);
          if (r) return r;
        }
        // Prefix + text
        if (hl.prefix) {
          const pNeedle = hl.prefix + targetText;
          const pIdx = full.indexOf(pNeedle);
          if (pIdx !== -1) {
            const s = pIdx + hl.prefix.length;
            const r = createRangeFromOffsets(model.segments, s, s + targetText.length);
            if (r) return r;
          }
        }
        // Text + suffix
        if (hl.suffix) {
          const sNeedle = targetText + hl.suffix;
          const sIdx = full.indexOf(sNeedle);
          if (sIdx !== -1) {
            const r = createRangeFromOffsets(model.segments, sIdx, sIdx + targetText.length);
            if (r) return r;
          }
        }
      }

      // Fallback: first match of text inside chapter
      const plainIdx = full.indexOf(targetText);
      if (plainIdx !== -1) {
        const r = createRangeFromOffsets(model.segments, plainIdx, plainIdx + targetText.length);
        if (r) return r;
      }
    }

    return null;
  }

  // =========================================================================
  // 4. DOM FALLBACK HIGHLIGHTING HELPERS (<mark> & <span class="st-hl-fallback">)
  // =========================================================================
  function getTextNodesInRange(range) {
    const ancestor =
      range.commonAncestorContainer.nodeType === 3
        ? range.commonAncestorContainer.parentElement
        : range.commonAncestorContainer;
    if (!ancestor) return [];
    const nodes = [];
    if (range.startContainer === range.endContainer && range.startContainer.nodeType === 3) {
      return [
        {
          node: range.startContainer,
          start: range.startOffset,
          end: range.endOffset,
        },
      ];
    }
    const walker = document.createTreeWalker(ancestor, NodeFilter.SHOW_TEXT);
    let n;
    let started = false;
    while ((n = walker.nextNode())) {
      if (n === range.startContainer) {
        started = true;
        const end = n === range.endContainer ? range.endOffset : n.nodeValue.length;
        if (end > range.startOffset) nodes.push({ node: n, start: range.startOffset, end });
        if (n === range.endContainer) break;
      } else if (started) {
        if (n === range.endContainer) {
          if (range.endOffset > 0) nodes.push({ node: n, start: 0, end: range.endOffset });
          break;
        } else if (n.nodeValue.length > 0) {
          nodes.push({ node: n, start: 0, end: n.nodeValue.length });
        }
      }
    }
    return nodes;
  }

  function clearFallbackNodes(selector) {
    const els = document.querySelectorAll(selector);
    els.forEach((el) => {
      const parent = el.parentNode;
      if (!parent) return;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
      parent.normalize();
    });
  }

  function wrapRangeWithTag(range, tagName, className, attrs) {
    const slices = getTextNodesInRange(range);
    const created = [];
    // Wrap in reverse order so offsets stay valid
    for (let i = slices.length - 1; i >= 0; i--) {
      const { node, start, end } = slices[i];
      if (end <= start) continue;
      const target = node.splitText(start);
      target.splitText(end - start);
      const wrapper = document.createElement(tagName);
      wrapper.className = className;
      if (attrs) {
        Object.keys(attrs).forEach((k) => wrapper.setAttribute(k, attrs[k]));
      }
      target.parentNode.insertBefore(wrapper, target);
      wrapper.appendChild(target);
      created.unshift(wrapper);
    }
    return created;
  }

  // =========================================================================
  // 5. SCROLLING & <details> AUTO-OPEN
  // =========================================================================
  function openAncestorDetails(node, markAsSearchOpened) {
    let el = node.nodeType === 3 ? node.parentElement : node;
    while (el) {
      if (el.tagName === 'DETAILS' && !el.open) {
        el.open = true;
        if (markAsSearchOpened) el.dataset.searchOpened = 'true';
      }
      el = el.parentElement;
    }
  }

  function scrollToRange(range) {
    if (!range) return;
    openAncestorDetails(range.startContainer, false);

    const rect = range.getBoundingClientRect();
    const stickyNav = document.querySelector('.sticky-nav');
    const mobileBar = document.querySelector('.guide-mobile-bar');
    const navH = stickyNav ? stickyNav.offsetHeight : 0;
    const mobH =
      mobileBar && getComputedStyle(mobileBar).display !== 'none' ? mobileBar.offsetHeight : 0;
    const topOffset = navH + mobH + 20;

    const targetY = window.scrollY + rect.top - topOffset;
    window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });

    const anchorEl =
      range.startContainer.nodeType === 3
        ? range.startContainer.parentElement
        : range.startContainer;
    const tableWrap = anchorEl && anchorEl.closest('.table-wrap');
    if (tableWrap) {
      const wrapRect = tableWrap.getBoundingClientRect();
      if (rect.left < wrapRect.left || rect.right > wrapRect.right) {
        tableWrap.scrollTo({
          left: Math.max(0, tableWrap.scrollLeft + rect.left - wrapRect.left - 24),
          behavior: 'smooth',
        });
      }
    }
  }

  // =========================================================================
  // 6. INITIALIZATION
  // =========================================================================
  function initStudyTools() {
    const main = getSearchRoot();
    const cards = Array.from(main.querySelectorAll('section.card'));
    const glossary = buildGlossaryMap();

    // -----------------------------------------------------------------------
    // A. INTELLIGENT NON-AI SEARCH
    // -----------------------------------------------------------------------
    const searchInput = document.getElementById('quickSearch');
    let searchState = {
      query: '',
      ranges: [], // Range objects
      fallbackGroups: [], // Array<Array<HTMLElement>> when CSS.highlights unsupported
      activeIndex: -1,
      focusMode: false,
      debounceTimer: null,
    };

    if (searchInput) {
      // Wrap searchInput and inject compact controls bar directly underneath
      const wrap = document.createElement('div');
      wrap.className = 'st-search-wrap';
      searchInput.parentNode.insertBefore(wrap, searchInput);
      wrap.appendChild(searchInput);

      const controls = document.createElement('div');
      controls.className = 'st-search-controls';
      controls.innerHTML =
        '<div class="st-search-left">' +
        '<span class="st-match-count" id="stMatchCount" aria-live="polite">Ready</span>' +
        '<button type="button" class="st-btn" id="stPrevBtn" disabled title="Previous match (Shift+Enter)">&uarr; Prev</button>' +
        '<button type="button" class="st-btn" id="stNextBtn" disabled title="Next match (Enter)">&darr; Next</button>' +
        '<button type="button" class="st-btn" id="stClearBtn" disabled title="Clear search (Esc)">Clear</button>' +
        '</div>' +
        '<div class="st-search-right">' +
        '<button type="button" class="st-btn" id="stFocusBtn" aria-pressed="false" title="Show only matching facts/rows">Focus Mode: Off</button>' +
        '<span class="st-kbd-hint">/ search &middot; Enter next &middot; Esc clear</span>' +
        '</div>';
      wrap.appendChild(controls);

      const countEl = document.getElementById('stMatchCount');
      const prevBtn = document.getElementById('stPrevBtn');
      const nextBtn = document.getElementById('stNextBtn');
      const clearBtn = document.getElementById('stClearBtn');
      const focusBtn = document.getElementById('stFocusBtn');

      let searchWrapInView = true;

      function syncFloatingControls() {
        const shouldFloat = Boolean(searchState.query) && !searchWrapInView;
        if (shouldFloat && !controls.classList.contains('st-controls-floating')) {
          wrap.style.minHeight = wrap.offsetHeight + 'px';
          controls.classList.add('st-controls-floating');
        } else if (!shouldFloat && controls.classList.contains('st-controls-floating')) {
          controls.classList.remove('st-controls-floating');
          wrap.style.minHeight = '';
        }
      }

      if ('IntersectionObserver' in window) {
        const obs = new IntersectionObserver(
          (entries) => {
            searchWrapInView = entries[0] ? entries[0].isIntersecting : true;
            syncFloatingControls();
          },
          { threshold: 0 }
        );
        obs.observe(searchInput);
      } else {
        window.addEventListener(
          'scroll',
          () => {
            const r = searchInput.getBoundingClientRect();
            searchWrapInView = r.bottom > 0 && r.top < window.innerHeight;
            syncFloatingControls();
          },
          { passive: true }
        );
      }

      function clearSearchHighlights() {
        if (SUPPORTS_CUSTOM_HL) {
          CSS.highlights.delete('search-all');
          CSS.highlights.delete('search-active');
        } else {
          clearFallbackNodes('mark.st-search-mark');
          renderAllUserHighlights();
        }
        searchState.ranges = [];
        searchState.fallbackGroups = [];
        searchState.activeIndex = -1;
      }

      function resetCardAndFocusVisibility() {
        cards.forEach((c) => c.classList.remove('hidden-card'));
        main.querySelectorAll('.st-focus-hidden').forEach((el) => el.classList.remove('st-focus-hidden'));
        main.querySelectorAll('details[data-search-opened="true"]').forEach((det) => {
          det.open = false;
          delete det.dataset.searchOpened;
        });
      }

      function updateControlsUI() {
        const total = SUPPORTS_CUSTOM_HL
          ? searchState.ranges.length
          : searchState.fallbackGroups.length;
        const hasQuery = searchState.query.length > 0;

        clearBtn.disabled = !hasQuery;
        prevBtn.disabled = total === 0;
        nextBtn.disabled = total === 0;

        countEl.classList.remove('has-matches', 'no-matches');
        if (!hasQuery) {
          countEl.textContent = 'Ready';
        } else if (total === 0) {
          countEl.textContent = '0 / 0';
          countEl.classList.add('no-matches');
        } else {
          countEl.textContent = searchState.activeIndex + 1 + ' / ' + total;
          countEl.classList.add('has-matches');
        }
      }

      function renderActiveMatch(shouldScroll) {
        const total = SUPPORTS_CUSTOM_HL
          ? searchState.ranges.length
          : searchState.fallbackGroups.length;
        if (total === 0) return;

        if (searchState.activeIndex < 0) searchState.activeIndex = 0;
        if (searchState.activeIndex >= total) searchState.activeIndex = total - 1;

        if (SUPPORTS_CUSTOM_HL) {
          const allExceptActive = searchState.ranges.filter((_, i) => i !== searchState.activeIndex);
          const activeRange = searchState.ranges[searchState.activeIndex];
          if (allExceptActive.length > 0) {
            const hAll = new Highlight(...allExceptActive);
            hAll.priority = 2;
            CSS.highlights.set('search-all', hAll);
          } else {
            CSS.highlights.delete('search-all');
          }
          const hActive = new Highlight(activeRange);
          hActive.priority = 3;
          CSS.highlights.set('search-active', hActive);

          if (shouldScroll) scrollToRange(activeRange);
        } else {
          searchState.fallbackGroups.forEach((group, idx) => {
            group.forEach((m) => {
              m.classList.toggle('active', idx === searchState.activeIndex);
            });
          });
          const firstMark = searchState.fallbackGroups[searchState.activeIndex]?.[0];
          if (shouldScroll && firstMark) {
            const r = document.createRange();
            r.selectNodeContents(firstMark);
            scrollToRange(r);
          }
        }

        updateControlsUI();
      }

      function applyFocusMode(matchedBlocksSet) {
        main.querySelectorAll('.st-focus-hidden').forEach((el) => el.classList.remove('st-focus-hidden'));
        if (!searchState.focusMode || !searchState.query) return;

        cards.forEach((card) => {
          if (card.classList.contains('hidden-card')) return;

          // Hide non-matching tr inside tbody (keep thead)
          card.querySelectorAll('.table-wrap').forEach((tw) => {
            const rows = Array.from(tw.querySelectorAll('tbody tr'));
            if (rows.length === 0) return;
            let anyRowMatch = false;
            rows.forEach((tr) => {
              const hit = matchedBlocksSet.has(tr);
              if (hit) anyRowMatch = true;
              else tr.classList.add('st-focus-hidden');
            });
            if (!anyRowMatch) {
              tw.classList.add('st-focus-hidden');
            }
          });

          // Hide non-matching li items and empty lists
          card.querySelectorAll('li').forEach((li) => {
            if (!matchedBlocksSet.has(li)) {
              li.classList.add('st-focus-hidden');
            }
          });
          card.querySelectorAll('ul, ol').forEach((list) => {
            if (list.querySelectorAll('li:not(.st-focus-hidden)').length === 0) {
              list.classList.add('st-focus-hidden');
            }
          });

          // Hide office-cards that end up with zero visible li items
          card.querySelectorAll('.office-card').forEach((oc) => {
            const visibleLis = oc.querySelectorAll('li:not(.st-focus-hidden)');
            if (visibleLis.length === 0) oc.classList.add('st-focus-hidden');
          });

          // Hide non-matching details
          card.querySelectorAll('details').forEach((det) => {
            if (!matchedBlocksSet.has(det)) {
              det.classList.add('st-focus-hidden');
            }
          });
        });
      }

      function runSearch(rawQuery) {
        const query = rawQuery.trim();
        searchState.query = query;

        clearSearchHighlights();
        resetCardAndFocusVisibility();

        if (!query) {
          syncFloatingControls();
          updateControlsUI();
          return;
        }

        const rawTokens = query.toLowerCase().split(/\s+/).filter(Boolean);
        const tokenGroups = rawTokens.map((tok) => {
          const alts = [tok];
          const cleanTok = tok.replace(/[.,;:!?()]/g, '');
          if (cleanTok && cleanTok !== tok) alts.push(cleanTok);

          const fullSet = glossary.abbrToFull.get(tok) || glossary.abbrToFull.get(cleanTok);
          if (fullSet) {
            fullSet.forEach((f) => alts.push(f));
          }
          return Array.from(new Set(alts));
        });

        const wholePhraseAbbrs = findGlossaryAbbrsForQuery(query, glossary.fullEntries);

        const matchedBlocks = new Set();
        const allRanges = [];

        cards.forEach((card) => {
          // Ordered block selectors so matches flow top-to-bottom naturally
          const blocks = Array.from(
            card.querySelectorAll('h2, h3, h4, .start-box, .trap-box, p, li, tbody tr, details')
          );

          let cardMatched = false;

          blocks.forEach((block) => {
            const model = collectTextModel(block);
            if (!model.fullText.trim()) return;

            const spans = matchBlockWithTokenGroups(model, tokenGroups, wholePhraseAbbrs);
            if (spans.length > 0) {
              cardMatched = true;
              matchedBlocks.add(block);
              openAncestorDetails(block, true);

              spans.forEach(([s, e]) => {
                const r = createRangeFromOffsets(model.segments, s, e);
                if (r) allRanges.push(r);
              });
            }
          });

          if (!cardMatched) {
            card.classList.add('hidden-card');
          }
        });

        // Deduplicate ranges that point to the exact same start/end (e.g., nested elements)
        const dedupedRanges = [];
        allRanges.forEach((r) => {
          const dup = dedupedRanges.some(
            (existing) =>
              existing.startContainer === r.startContainer &&
              existing.startOffset === r.startOffset &&
              existing.endContainer === r.endContainer &&
              existing.endOffset === r.endOffset
          );
          if (!dup) dedupedRanges.push(r);
        });

        if (SUPPORTS_CUSTOM_HL) {
          searchState.ranges = dedupedRanges;
        } else {
          // Wrap in reverse document order to avoid shifting earlier offsets
          const groups = [];
          for (let i = dedupedRanges.length - 1; i >= 0; i--) {
            const marks = wrapRangeWithTag(dedupedRanges[i], 'mark', 'st-search-mark');
            if (marks.length > 0) groups.unshift(marks);
          }
          searchState.fallbackGroups = groups;
        }

        applyFocusMode(matchedBlocks);

        if ((SUPPORTS_CUSTOM_HL ? searchState.ranges.length : searchState.fallbackGroups.length) > 0) {
          searchState.activeIndex = 0;
          renderActiveMatch(false);
        } else {
          updateControlsUI();
        }
        syncFloatingControls();
      }

      function stepMatch(delta) {
        const total = SUPPORTS_CUSTOM_HL
          ? searchState.ranges.length
          : searchState.fallbackGroups.length;
        if (total === 0) return;
        searchState.activeIndex = (searchState.activeIndex + delta + total) % total;
        renderActiveMatch(true);
      }

      function clearSearch() {
        searchInput.value = '';
        runSearch('');
      }

      searchInput.addEventListener('input', () => {
        clearTimeout(searchState.debounceTimer);
        searchState.debounceTimer = setTimeout(() => {
          runSearch(searchInput.value);
        }, 120);
      });

      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          clearTimeout(searchState.debounceTimer);
          if (searchState.query !== searchInput.value.trim()) {
            runSearch(searchInput.value);
          }
          stepMatch(e.shiftKey ? -1 : 1);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          clearSearch();
          searchInput.blur();
        }
      });

      prevBtn.addEventListener('click', () => stepMatch(-1));
      nextBtn.addEventListener('click', () => stepMatch(1));
      clearBtn.addEventListener('click', () => {
        clearSearch();
        searchInput.focus();
      });

      focusBtn.addEventListener('click', () => {
        searchState.focusMode = !searchState.focusMode;
        focusBtn.classList.toggle('active', searchState.focusMode);
        focusBtn.setAttribute('aria-pressed', String(searchState.focusMode));
        focusBtn.textContent = 'Focus Mode: ' + (searchState.focusMode ? 'On' : 'Off');
        if (searchState.query) {
          runSearch(searchInput.value);
        }
      });

      document.addEventListener('keydown', (e) => {
        const activeTag = document.activeElement ? document.activeElement.tagName : '';
        const isTyping =
          activeTag === 'INPUT' ||
          activeTag === 'TEXTAREA' ||
          activeTag === 'SELECT' ||
          (document.activeElement && document.activeElement.isContentEditable);

        if (e.key === '/' && !isTyping && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          searchInput.focus();
          searchInput.select();
        } else if (e.key === 'Escape' && !isTyping && searchState.query) {
          // Only clear if drawer isn't open
          if (!drawer.classList.contains('open')) {
            clearSearch();
          }
        }
      });
    }

    // -----------------------------------------------------------------------
    // B. PERSISTENT 3-COLOR STUDY HIGHLIGHTER
    // -----------------------------------------------------------------------
    const STORAGE_KEY =
      'study_hl_' +
      (document.title || 'guide')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');

    function loadHighlights() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }

    function saveHighlights(list) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      } catch {
        // Ignore quota errors cleanly
      }
    }

    let highlights = loadHighlights();
    let resolvedRangesMap = new Map(); // id -> Range
    let activeFilter = 'all';
    let pendingSelectionRange = null;
    let mobileSelTimer = null;

    // 1. Add "Highlights (N)" button to sticky nav bar
    const navInner = document.querySelector('.sticky-nav .nav-inner');
    const themeBtn = document.getElementById('themeToggle');
    const drawerBtn = document.createElement('button');
    drawerBtn.type = 'button';
    drawerBtn.className = 'hl-nav-btn';
    drawerBtn.id = 'hlDrawerBtn';
    drawerBtn.innerHTML =
      '<span class="hl-nav-dot" aria-hidden="true"></span><span>Highlights (<span id="hlCount">0</span>)</span>';

    if (navInner) {
      if (themeBtn && themeBtn.parentNode === navInner) {
        navInner.insertBefore(drawerBtn, themeBtn);
      } else {
        navInner.appendChild(drawerBtn);
      }
    }
    const hlCountEl = drawerBtn.querySelector('#hlCount');

    // 2. Floating Selection Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'hl-toolbar';
    toolbar.id = 'hlToolbar';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Highlight selection');
    toolbar.innerHTML =
      '<button type="button" class="hl-color-btn" data-color="hl-yellow" title="Key Fact / Formula"><span class="hl-swatch yellow"></span><span class="hl-btn-label">Key</span></button>' +
      '<button type="button" class="hl-color-btn" data-color="hl-red" title="Weak / Revise Again"><span class="hl-swatch red"></span><span class="hl-btn-label">Weak</span></button>' +
      '<button type="button" class="hl-color-btn" data-color="hl-green" title="Mastered"><span class="hl-swatch green"></span><span class="hl-btn-label">Mastered</span></button>' +
      '<button type="button" class="hl-remove-btn" id="hlRemoveBtn" title="Remove overlapping highlight">Remove</button>';
    document.body.appendChild(toolbar);

    const removeBtn = document.getElementById('hlRemoveBtn');

    // Prevent pointerdown on toolbar from clearing selection before click fires
    toolbar.addEventListener('pointerdown', (e) => {
      e.preventDefault();
    });

    // 3. Rapid-Review Highlights Drawer
    const drawerBackdrop = document.createElement('div');
    drawerBackdrop.className = 'hl-drawer-backdrop';
    drawerBackdrop.id = 'hlDrawerBackdrop';

    const drawer = document.createElement('aside');
    drawer.className = 'hl-drawer';
    drawer.id = 'hlDrawer';
    drawer.setAttribute('aria-label', 'Saved Highlights');
    drawer.innerHTML =
      '<div class="hl-drawer-header">' +
      '<h2 class="hl-drawer-title">Study Highlights (<span id="hlDrawerTotal">0</span>)</h2>' +
      '<button type="button" class="hl-drawer-close" id="hlDrawerClose" aria-label="Close highlights drawer">&times;</button>' +
      '</div>' +
      '<div class="hl-drawer-toolbar">' +
      '<div class="hl-filter-chips" id="hlFilterChips">' +
      '<button type="button" class="hl-filter-chip active" data-filter="all">All</button>' +
      '<button type="button" class="hl-filter-chip" data-filter="hl-red"><span class="hl-swatch red"></span> Weak</button>' +
      '<button type="button" class="hl-filter-chip" data-filter="hl-yellow"><span class="hl-swatch yellow"></span> Key</button>' +
      '<button type="button" class="hl-filter-chip" data-filter="hl-green"><span class="hl-swatch green"></span> Done</button>' +
      '</div>' +
      '<div class="hl-io-row">' +
      '<button type="button" class="st-btn" id="hlExportBtn">Export JSON</button>' +
      '<button type="button" class="st-btn" id="hlImportBtn">Import JSON</button>' +
      '<button type="button" class="st-btn" id="hlClearAllBtn">Clear All</button>' +
      '<input type="file" id="hlImportInput" accept=".json,application/json" hidden>' +
      '</div>' +
      '<div class="hl-confirm-bar" id="hlConfirmBar" hidden>' +
      '<span>Delete all highlights?</span>' +
      '<div style="display:flex;gap:6px;">' +
      '<button type="button" class="st-btn" id="hlConfirmYes">Yes, Clear</button>' +
      '<button type="button" class="st-btn" id="hlConfirmNo">Cancel</button>' +
      '</div>' +
      '</div>' +
      '<div class="hl-status-msg" id="hlStatusMsg" hidden></div>' +
      '</div>' +
      '<div class="hl-drawer-body" id="hlDrawerBody"></div>';

    document.body.appendChild(drawerBackdrop);
    document.body.appendChild(drawer);

    const drawerTotalEl = document.getElementById('hlDrawerTotal');
    const drawerBodyEl = document.getElementById('hlDrawerBody');
    const drawerCloseBtn = document.getElementById('hlDrawerClose');
    const filterChipsEl = document.getElementById('hlFilterChips');
    const exportBtn = document.getElementById('hlExportBtn');
    const importBtn = document.getElementById('hlImportBtn');
    const importInput = document.getElementById('hlImportInput');
    const clearAllBtn = document.getElementById('hlClearAllBtn');
    const confirmBar = document.getElementById('hlConfirmBar');
    const confirmYesBtn = document.getElementById('hlConfirmYes');
    const confirmNoBtn = document.getElementById('hlConfirmNo');
    const statusMsgEl = document.getElementById('hlStatusMsg');

    function showStatus(msg) {
      statusMsgEl.textContent = msg;
      statusMsgEl.hidden = false;
      setTimeout(() => {
        statusMsgEl.hidden = true;
      }, 2800);
    }

    function renderAllUserHighlights() {
      resolvedRangesMap.clear();
      const byColor = { 'hl-yellow': [], 'hl-red': [], 'hl-green': [] };

      if (!SUPPORTS_CUSTOM_HL) {
        clearFallbackNodes('span.st-hl-fallback');
      }

      highlights.forEach((hl) => {
        const range = resolveHighlightAnchor(hl, main);
        if (range) {
          resolvedRangesMap.set(hl.id, range);
          if (byColor[hl.color]) byColor[hl.color].push({ hl, range });
        }
      });

      if (SUPPORTS_CUSTOM_HL) {
        Object.keys(byColor).forEach((color) => {
          const items = byColor[color];
          if (items.length > 0) {
            const h = new Highlight(...items.map((x) => x.range));
            h.priority = 1;
            CSS.highlights.set(color, h);
          } else {
            CSS.highlights.delete(color);
          }
        });
      } else {
        // Fallback wrapping when CSS Custom Highlight API is unavailable
        Object.keys(byColor).forEach((color) => {
          byColor[color].forEach(({ hl, range }) => {
            wrapRangeWithTag(range, 'span', 'st-hl-fallback ' + color, { 'data-hl-id': hl.id });
          });
        });
      }

      hlCountEl.textContent = String(highlights.length);
      drawerTotalEl.textContent = String(highlights.length);
      clearAllBtn.disabled = highlights.length === 0;
      exportBtn.disabled = highlights.length === 0;
    }

    function rangesOverlap(r1, r2) {
      if (!r1 || !r2) return false;
      try {
        return (
          r1.compareBoundaryPoints(Range.START_TO_END, r2) > 0 &&
          r1.compareBoundaryPoints(Range.END_TO_START, r2) < 0
        );
      } catch {
        return false;
      }
    }

    function findOverlappingHighlightIds(range) {
      const ids = [];
      resolvedRangesMap.forEach((hlRange, id) => {
        if (rangesOverlap(range, hlRange)) ids.push(id);
      });
      return ids;
    }

    function hideToolbar() {
      toolbar.classList.remove('visible');
      pendingSelectionRange = null;
    }

    function isValidContentSelection(sel) {
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
      const range = sel.getRangeAt(0);
      const text = range.toString().trim();
      if (!text) return null;

      const startEl =
        range.startContainer.nodeType === 3
          ? range.startContainer.parentElement
          : range.startContainer;
      const endEl =
        range.endContainer.nodeType === 3 ? range.endContainer.parentElement : range.endContainer;
      if (!startEl || !endEl) return null;

      if (!main.contains(startEl) || !main.contains(endEl)) return null;
      if (shouldSkipElement(startEl) || shouldSkipElement(endEl)) return null;
      // Also avoid triggering on hero/search area
      if (startEl.closest('header.hero') || endEl.closest('header.hero')) return null;

      return range;
    }

    function showToolbarForRange(range) {
      pendingSelectionRange = range.cloneRange();
      const overlaps = findOverlappingHighlightIds(pendingSelectionRange);
      removeBtn.disabled = overlaps.length === 0;

      toolbar.classList.add('visible');
      const rect = range.getBoundingClientRect();
      const tbRect = toolbar.getBoundingClientRect();

      let left = rect.left + rect.width / 2 - tbRect.width / 2;
      left = Math.max(8, Math.min(window.innerWidth - tbRect.width - 8, left));

      let top = rect.top - tbRect.height - 10;
      const minSafeTop = 70;
      if (top < minSafeTop) {
        top = rect.bottom + 10;
      }
      top = Math.max(8, Math.min(window.innerHeight - tbRect.height - 10, top));

      toolbar.style.left = left + 'px';
      toolbar.style.top = top + 'px';
    }

    function handleSelectionCheck() {
      const sel = window.getSelection();
      const range = isValidContentSelection(sel);
      if (range) {
        showToolbarForRange(range);
      } else {
        hideToolbar();
      }
    }

    document.addEventListener('mouseup', () => {
      setTimeout(handleSelectionCheck, 10);
    });

    document.addEventListener('selectionchange', () => {
      clearTimeout(mobileSelTimer);
      mobileSelTimer = setTimeout(handleSelectionCheck, 220);
    });

    window.addEventListener(
      'scroll',
      () => {
        if (toolbar.classList.contains('visible')) {
          if (pendingSelectionRange) {
            const rect = pendingSelectionRange.getBoundingClientRect();
            if (rect.bottom < 0 || rect.top > window.innerHeight) {
              hideToolbar();
            } else {
              showToolbarForRange(pendingSelectionRange);
            }
          } else {
            hideToolbar();
          }
        }
      },
      { passive: true }
    );

    function normalizeRangeToTextNodes(rawRange) {
      const slices = getTextNodesInRange(rawRange);
      if (slices.length === 0) return null;
      const first = slices[0];
      const last = slices[slices.length - 1];
      try {
        const nr = document.createRange();
        nr.setStart(first.node, first.start);
        nr.setEnd(last.node, last.end);
        if (nr.collapsed || !nr.toString().trim()) return null;
        return nr;
      } catch {
        return null;
      }
    }

    function addHighlightFromRange(rawRange, color) {
      const range = normalizeRangeToTextNodes(rawRange);
      if (!range) return;
      const text = range.toString();
      if (!text.trim()) return;

      const startEl =
        range.startContainer.nodeType === 3
          ? range.startContainer.parentElement
          : range.startContainer;
      const card = startEl.closest('section.card');
      const chapterId = card && card.id ? card.id : '';

      const startPath = getElementPath(range.startContainer, main);
      const endPath = getElementPath(range.endContainer, main);
      const ctx = getContextAroundRange(range, main);

      // If selection exactly matches or overlaps an existing highlight, replace overlapping ones cleanly
      const overlappingIds = findOverlappingHighlightIds(range);
      if (overlappingIds.length > 0) {
        highlights = highlights.filter((h) => !overlappingIds.includes(h.id));
      }

      const entry = {
        id: 'hl_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
        color,
        text,
        chapterId,
        startPath,
        startOffset: range.startOffset,
        endPath,
        endOffset: range.endOffset,
        prefix: ctx.prefix,
        suffix: ctx.suffix,
      };

      highlights.push(entry);
      saveHighlights(highlights);
      renderAllUserHighlights();
      renderDrawer();

      try {
        window.getSelection().removeAllRanges();
      } catch {
        // ignore
      }
      hideToolbar();
    }

    toolbar.querySelectorAll('.hl-color-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const color = btn.dataset.color;
        if (pendingSelectionRange) {
          addHighlightFromRange(pendingSelectionRange, color);
        }
      });
    });

    removeBtn.addEventListener('click', () => {
      if (!pendingSelectionRange) return;
      const overlappingIds = findOverlappingHighlightIds(pendingSelectionRange);
      if (overlappingIds.length === 0) return;
      highlights = highlights.filter((h) => !overlappingIds.includes(h.id));
      saveHighlights(highlights);
      renderAllUserHighlights();
      renderDrawer();
      try {
        window.getSelection().removeAllRanges();
      } catch {
        // ignore
      }
      hideToolbar();
    });

    // -----------------------------------------------------------------------
    // C. DRAWER RENDERING & ACTIONS
    // -----------------------------------------------------------------------
    function getChapterLabel(chapterId) {
      if (!chapterId) return 'Guide Note';
      const sec = document.getElementById(chapterId);
      const h2 = sec && sec.querySelector('h2');
      if (!h2) return chapterId;
      return h2.textContent.replace(/\s+/g, ' ').trim().slice(0, 48);
    }

    function renderDrawer() {
      const counts = {
        all: highlights.length,
        'hl-red': highlights.filter((h) => h.color === 'hl-red').length,
        'hl-yellow': highlights.filter((h) => h.color === 'hl-yellow').length,
        'hl-green': highlights.filter((h) => h.color === 'hl-green').length,
      };

      filterChipsEl.querySelectorAll('.hl-filter-chip').forEach((chip) => {
        const f = chip.dataset.filter;
        chip.classList.toggle('active', f === activeFilter);
        if (f === 'all') chip.textContent = 'All (' + counts.all + ')';
        else if (f === 'hl-red')
          chip.innerHTML = '<span class="hl-swatch red"></span> Weak (' + counts['hl-red'] + ')';
        else if (f === 'hl-yellow')
          chip.innerHTML =
            '<span class="hl-swatch yellow"></span> Key (' + counts['hl-yellow'] + ')';
        else if (f === 'hl-green')
          chip.innerHTML = '<span class="hl-swatch green"></span> Done (' + counts['hl-green'] + ')';
      });

      const visible =
        activeFilter === 'all' ? highlights : highlights.filter((h) => h.color === activeFilter);

      if (visible.length === 0) {
        drawerBodyEl.innerHTML =
          '<div class="hl-empty">' +
          (highlights.length === 0
            ? 'No highlights saved yet.<br>Select any text in the guide to highlight it in Yellow, Red, or Green.'
            : 'No highlights match this color filter.') +
          '</div>';
        return;
      }

      const groupOrder = ['hl-red', 'hl-yellow', 'hl-green'];
      let html = '';

      groupOrder.forEach((color) => {
        const items = visible.filter((h) => h.color === color);
        if (items.length === 0) return;
        const meta = HL_COLORS[color];
        html += '<div class="hl-group">';
        html +=
          '<h3 class="hl-group-title"><span class="hl-swatch ' +
          meta.swatch +
          '"></span>' +
          meta.label +
          ' — ' +
          meta.meaning +
          ' (' +
          items.length +
          ')</h3>';

        items.forEach((item) => {
          const borderClass = 'border-' + meta.swatch;
          const chapLabel = escapeHtml(getChapterLabel(item.chapterId));
          const snippet = escapeHtml(item.text.trim());
          html +=
            '<div class="hl-item ' +
            borderClass +
            '" data-id="' +
            escapeHtml(item.id) +
            '">' +
            '<button type="button" class="hl-item-link" data-jump="' +
            escapeHtml(item.id) +
            '">' +
            '<div class="hl-item-meta">' +
            chapLabel +
            '</div>' +
            '<div class="hl-item-text">' +
            snippet +
            '</div>' +
            '</button>' +
            '<button type="button" class="hl-item-del" data-del="' +
            escapeHtml(item.id) +
            '" title="Delete highlight" aria-label="Delete highlight">&times;</button>' +
            '</div>';
        });

        html += '</div>';
      });

      drawerBodyEl.innerHTML = html;
    }

    function openDrawer() {
      confirmBar.hidden = true;
      renderDrawer();
      drawer.classList.add('open');
      drawerBackdrop.classList.add('open');
    }

    function closeDrawer() {
      drawer.classList.remove('open');
      drawerBackdrop.classList.remove('open');
      confirmBar.hidden = true;
    }

    drawerBtn.addEventListener('click', openDrawer);
    drawerCloseBtn.addEventListener('click', closeDrawer);
    drawerBackdrop.addEventListener('click', closeDrawer);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.classList.contains('open')) {
        closeDrawer();
      }
    });

    filterChipsEl.addEventListener('click', (e) => {
      const chip = e.target.closest('.hl-filter-chip');
      if (!chip) return;
      activeFilter = chip.dataset.filter;
      renderDrawer();
    });

    drawerBodyEl.addEventListener('click', (e) => {
      const delBtn = e.target.closest('[data-del]');
      if (delBtn) {
        const id = delBtn.dataset.del;
        highlights = highlights.filter((h) => h.id !== id);
        saveHighlights(highlights);
        renderAllUserHighlights();
        renderDrawer();
        return;
      }

      const jumpBtn = e.target.closest('[data-jump]');
      if (jumpBtn) {
        const id = jumpBtn.dataset.jump;
        const item = highlights.find((h) => h.id === id);
        if (!item) return;

        // If hidden by current search/focus mode, reveal its card/element first
        let range = resolvedRangesMap.get(id) || resolveHighlightAnchor(item, main);
        if (!range) {
          showStatus('Could not locate snippet in page.');
          return;
        }
        const anchorEl =
          range.startContainer.nodeType === 3
            ? range.startContainer.parentElement
            : range.startContainer;
        const card = anchorEl && anchorEl.closest('section.card');
        if (card) card.classList.remove('hidden-card');
        anchorEl?.closest('.st-focus-hidden')?.classList.remove('st-focus-hidden');

        closeDrawer();
        // Re-resolve after un-hiding/opening details so geometry is accurate
        openAncestorDetails(range.startContainer, false);
        range = resolveHighlightAnchor(item, main) || range;
        scrollToRange(range);

        // Brief visual pulse using search-active highlight if no active search
        if (SUPPORTS_CUSTOM_HL && !searchState.query) {
          const pulse = new Highlight(range);
          pulse.priority = 3;
          CSS.highlights.set('search-active', pulse);
          setTimeout(() => {
            if (!searchState.query) CSS.highlights.delete('search-active');
          }, 1400);
        }
      }
    });

    clearAllBtn.addEventListener('click', () => {
      if (highlights.length === 0) return;
      confirmBar.hidden = false;
    });

    confirmNoBtn.addEventListener('click', () => {
      confirmBar.hidden = true;
    });

    confirmYesBtn.addEventListener('click', () => {
      highlights = [];
      saveHighlights(highlights);
      renderAllUserHighlights();
      renderDrawer();
      confirmBar.hidden = true;
      showStatus('All highlights cleared.');
    });

    exportBtn.addEventListener('click', () => {
      const payload = {
        guideTitle: document.title,
        storageKey: STORAGE_KEY,
        exportedAt: new Date().toISOString(),
        highlights,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = STORAGE_KEY + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showStatus('Exported ' + highlights.length + ' highlights.');
    });

    importBtn.addEventListener('click', () => {
      importInput.value = '';
      importInput.click();
    });

    importInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(String(reader.result));
          const incoming = Array.isArray(data) ? data : Array.isArray(data.highlights) ? data.highlights : null;
          if (!incoming) throw new Error('Invalid JSON format');

          const existingIds = new Set(highlights.map((h) => h.id));
          let added = 0;
          incoming.forEach((item) => {
            if (
              !item ||
              typeof item.text !== 'string' ||
              !HL_COLORS[item.color]
            ) {
              return;
            }
            const id = item.id && !existingIds.has(item.id)
              ? item.id
              : 'hl_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
            if (!existingIds.has(id)) {
              existingIds.add(id);
              highlights.push({
                id,
                color: item.color,
                text: item.text,
                chapterId: item.chapterId || '',
                startPath: Array.isArray(item.startPath) ? item.startPath : null,
                startOffset: Number(item.startOffset) || 0,
                endPath: Array.isArray(item.endPath) ? item.endPath : null,
                endOffset: Number(item.endOffset) || 0,
                prefix: item.prefix || '',
                suffix: item.suffix || '',
              });
              added++;
            }
          });

          saveHighlights(highlights);
          renderAllUserHighlights();
          renderDrawer();
          showStatus('Imported ' + added + ' highlight' + (added === 1 ? '' : 's') + '.');
        } catch {
          showStatus('Invalid JSON file.');
        }
      };
      reader.readAsText(file);
    });

    // Initial render of saved highlights
    renderAllUserHighlights();
    renderDrawer();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStudyTools);
  } else {
    initStudyTools();
  }
})();
