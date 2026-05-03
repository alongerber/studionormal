// ═══════════════════════════════════════════════════════════════════
// חצינורמלי STUDIO — APP.JS
// ═══════════════════════════════════════════════════════════════════

'use strict';

// ═══════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════
const state = {
  mode: 'video',              // 'video' | 'post' | 'whatsapp' | 'reply' | 'breakout'
  view: 'works',              // 'works' | 'moments' | 'create' | 'polish' | 'export' | 'breakout'
  apiKey: '',
  model: 'claude-opus-4-7',
  currentWork: null,
  activeIdx: -1,
  selectedLines: new Set(),
  styleMods: [],
  varietyMode: 'similar',     // Default: similar (was 'twin' — almost-identical alts are rarely what users want first)
  altCount: 5,                // Number of alternatives to request (1-8)
  selRange: null,
  styleTags: [],
  scriptTags: [],
  hookTags: [],
  selectedPattern: 'auto',
  dialogLevel: 'medium',
  analyticsItems: [],
  contextFiles: {},
  momentsFilter: 'all',
  currentMoment: null,
  currentPerfWorkId: null,
  autoCanonCheck: true,
  useFeedbackLoop: true,      // Top performers from perf log get injected into creative prompts
  // Breakout state
  breakoutHeat: 1,
  breakoutTags: [],
  breakoutIdeas: []           // current session's ideas (not persisted — ephemeral)
};

const TAG_ONLY_RE = /^\s*(\[[^\]]+\]\s*)+$/;
const TAG_STRIP_RE = /\[[^\]]+\]/g;

// ═══════════════════════════════════════════════════════════════════
// DOM HELPERS
// ═══════════════════════════════════════════════════════════════════
function $(id) { return document.getElementById(id); }
function $$(sel) { return document.querySelectorAll(sel); }
function v(id) { return $(id)?.value?.trim() || ''; }
function esc(t) { return (t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function fmt(t) { return esc(t).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>'); }

function toast(msg, type = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ═══════════════════════════════════════════════════════════════════
// MODE CONFIG
// ═══════════════════════════════════════════════════════════════════
const MODE_CONFIG = {
  video: {
    label: 'סרטון',
    accent: 'var(--ac)',
    hookTags: ['Big Short אבסורד', 'ChatGPT/טכנולוגיה', 'פרדוקס כלכלי', 'סיטואציה יומיומית', 'ילד כ-narrator', 'מספרי/סטטיסטי', 'Jojo Rabbit', 'פאנץ׳ מיד', 'הצהרה מזעזעת', 'השוואה לא חוקית'],
    scriptTags: ['2:00', '2:30', '3:00', 'מונולוג ישיר', 'סיפור עם ביטים', 'קצר וחד', 'פתיחה+סיום חזק', 'ללא תגיות', 'רגשי במיוחד', 'ציני במיוחד'],
    styleTags: ['קצר וחד', 'מופרע יותר', 'Big Short', 'רגשי עמוק', 'ציני', 'פיוטי שחור', 'פחות מילים', 'יותר קונקרטי', 'פאנץ׳ ממילה', 'שמור אורך'],
    showHooks: true,
    showPattern: false,
    showAvoid: true,
    showBrief: true,
    showReply: false,
    showDraft: true,
    unitLabel: 'המשפט',
    draftBtnText: '📄 ייצר תסריט',
    systemPrompt: typeof SYS_VIDEO !== 'undefined' ? SYS_VIDEO : ''
  },
  post: {
    label: 'פוסט',
    accent: 'var(--pr)',
    hookTags: [],
    scriptTags: ['קצר (150-200)', 'בינוני (200-280)', 'ארוך (280-350)', 'רגשי במיוחד', 'אירוני', 'פואטי', 'תמציתי', 'עם הילד', 'עם אקס', 'עם הורים'],
    styleTags: ['פחות פסיקים', 'יותר דיאלוג', 'פחות דיאלוג', 'קצר יותר', 'ארוך יותר', 'יותר קונקרטי', 'פחות מטאפורות', 'יותר Big Short', 'שמור אורך'],
    showHooks: false,
    showPattern: true,
    showAvoid: false,
    showBrief: true,
    showReply: false,
    showDraft: true,
    unitLabel: 'הפסקה',
    draftBtnText: '📝 ייצר פוסט',
    systemPrompt: typeof SYS_POST !== 'undefined' ? SYS_POST : ''
  },
  whatsapp: {
    label: 'ואטסאפ',
    accent: 'var(--wa)',
    hookTags: [],
    scriptTags: ['2 צ\'אטים', '3 צ\'אטים', '4 צ\'אטים', 'אמא+אבא', 'אמא+אבא+ארבל', 'גרושה מעורבת', 'פער זמן דרמטי', 'הרבה type-and-delete'],
    styleTags: ['יותר הקלד-ומחק', 'פחות הקלד-ומחק', 'יותר פער זמן', 'הודעות קצרות', 'דרמה חזקה', 'ארבל בסוף', 'וי אפור חזק'],
    showHooks: false,
    showPattern: false,
    showAvoid: false,
    showBrief: true,
    showReply: false,
    showDraft: true,
    unitLabel: 'השורה',
    draftBtnText: '💬 ייצר תסריט שיחה',
    systemPrompt: typeof SYS_WHATSAPP !== 'undefined' ? SYS_WHATSAPP : ''
  },
  reply: {
    label: 'תגובה',
    accent: 'var(--rp)',
    hookTags: [],
    scriptTags: [],
    styleTags: ['קצר יותר', 'ארוך יותר', 'חד יותר', 'יותר עצוב', 'יותר מצחיק', 'פחות נחמד', 'יותר קונקרטי', 'שמור אורך'],
    showHooks: false,
    showPattern: false,
    showAvoid: false,
    showBrief: false,
    showReply: true,
    showDraft: false,
    unitLabel: 'התגובה',
    draftBtnText: '',
    systemPrompt: typeof SYS_REPLY !== 'undefined' ? SYS_REPLY : ''
  },
  breakout: {
    label: 'פריצה',
    accent: 'var(--br)',
    hookTags: [],
    scriptTags: [],
    styleTags: ['פיזי', 'ביורוקרטי', 'חפצי', 'מפגש זר', 'פיתוי', 'אסור-להגיד', 'מחשבה לא-מודעת', 'מוזר-מאוד'],
    showHooks: false,
    showPattern: false,
    showAvoid: false,
    showBrief: false,
    showReply: false,
    showDraft: false,
    unitLabel: 'רעיון',
    draftBtnText: '',
    systemPrompt: typeof SYS_BREAKOUT !== 'undefined' ? SYS_BREAKOUT : ''
  }
};

// Model tier mapping — which model to use for which task
const MODEL_TIER = {
  // Light/fast tasks — Sonnet
  angles: 'sonnet',
  hooks: 'sonnet',
  alternatives: 'sonnet',
  fix: 'sonnet',
  score: 'sonnet',
  momentToBrief: 'sonnet',
  // Heavy/creative tasks — user-selected (usually Opus)
  draft: 'user',
  callbacks: 'user',
  analytics: 'user',
  canonCheck: 'user',
  reply: 'user',
  crossMode: 'user',
  perfAnalysis: 'user',
  // Breakout tasks — always Opus (creativity is critical)
  breakoutIdeas: 'opus',
  breakoutExpand: 'opus',
  wildAngles: 'opus'
};

function resolveModel(taskType) {
  const tier = MODEL_TIER[taskType] || 'user';
  if (tier === 'sonnet') return 'claude-sonnet-4-6';
  if (tier === 'opus') return 'claude-opus-4-7';
  return state.model; // user-selected
}

// ═══════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', async () => {
  try {
    await HatziDB.openDB();
  } catch (e) {
    toast('שגיאה בפתיחת מסד הנתונים: ' + e.message, 'error');
    return;
  }

  // load API key & model from storage
  state.apiKey = await HatziDB.getSetting('apiKey') || '';
  state.model = await HatziDB.getSetting('model') || 'claude-opus-4-7';
  $('modelSelect').value = state.model;
  updateStatus();

  // load context files
  state.contextFiles = await HatziDB.getContextFiles();

  // load feedback-loop preference (the top-performers injection toggle)
  const flPref = await HatziDB.getSetting('useFeedbackLoop');
  if (flPref !== null && flPref !== undefined) state.useFeedbackLoop = flPref;

  // build tag UI for all modes (we'll rebuild on mode switch)
  rebuildTagsForMode();

  // setup event listeners
  setupEventListeners();

  // Initialize alt-count slider/label to match state.altCount default
  if ($('altCountSlider')) {
    $('altCountSlider').value = state.altCount;
    setAltCount(state.altCount);
  }

  // apply initial mode visibility (video)
  const cfg = MODE_CONFIG.video;
  if ($('briefSection')) $('briefSection').style.display = cfg.showBrief ? '' : 'none';
  if ($('replyBriefSection')) $('replyBriefSection').style.display = cfg.showReply ? '' : 'none';

  // initial view
  await refreshWorksList();
  switchView('works');
});

function setupEventListeners() {
  // variety buttons
  $$('.variety-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.variety-btn').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      state.varietyMode = btn.dataset.v;
    });
  });

  // editable textarea — selection tracking
  $('wkEditable').addEventListener('mouseup', checkSelection);
  $('wkEditable').addEventListener('keyup', checkSelection);
  $('wkEditable').addEventListener('blur', () => setTimeout(() => {
    if (document.activeElement !== $('wkEditable')) $('selTool').classList.remove('show');
  }, 200));

  // Bug #6/#18 — track unsaved edits in textarea.
  // Previously: typing in textarea + clicking a different line silently lost the edit
  // because openLine() overwrites textarea.value without warning.
  // Now: any input marks dirty, beforeunload + line-switch warns.
  $('wkEditable').addEventListener('input', markDirty);

  // Bug #16 — persist freeText so it survives line navigation.
  // Previously the user typed a free instruction, switched line, and it was wiped.
  const ftEl = $('freeText');
  if (ftEl) {
    ftEl.addEventListener('input', () => {
      state._freeTextValue = ftEl.value;
    });
  }

  // Warn before unload if there are unsaved edits in the textarea.
  window.addEventListener('beforeunload', (e) => {
    if (state._dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // keyboard shortcuts
  document.addEventListener('keydown', handleKeyboard);
}

// Update the alt-count slider label and the generate button's text.
function setAltCount(n) {
  const num = Math.max(1, Math.min(8, parseInt(n, 10) || 5));
  state.altCount = num;
  const lbl = $('altCountLabel');
  if (lbl) lbl.textContent = num;
  const btn = $('genAltsBtn');
  if (btn) btn.textContent = `🎲 ייצר ${num} חלופות`;
}

// ─── Dirty-state machinery for the textarea (Bug #6/#18) ───────────────
function markDirty() {
  state._dirty = true;
  const lbl = $('wkLineNum');
  if (lbl && !lbl.dataset.dirty) {
    lbl.dataset.dirty = '1';
    lbl.textContent = lbl.textContent + ' •';
  }
}
function clearDirty() {
  state._dirty = false;
  const lbl = $('wkLineNum');
  if (lbl) {
    delete lbl.dataset.dirty;
    // strip trailing ' •' if present
    lbl.textContent = lbl.textContent.replace(/\s*•$/, '');
  }
}
function confirmAbandonDirty() {
  if (!state._dirty) return true;
  return confirm('יש שינויים לא שמורים בטקסט. לעבור בלי לשמור?');
}

// ─── Canon-check invalidation (Bug #8) ─────────────────────────────────
// When any line text changes, the saved canon-check result becomes stale.
// Don't keep showing yesterday's verdict on today's text.
function invalidateCanonCheck() {
  if (state.currentWork && state.currentWork.canonCheck) {
    delete state.currentWork.canonCheck;
  }
}

function handleKeyboard(e) {
  // Bug #7 — don't intercept Ctrl+Z/Y when the user is typing in an input/textarea.
  // The native browser undo for textarea characters is more useful than our work-snapshot undo
  // when the user is mid-typing. Our undo is still available via the toolbar buttons.
  const inEditable = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);

  // Ctrl/Cmd shortcuts
  if ((e.ctrlKey || e.metaKey)) {
    if (e.key === 'z' && !e.shiftKey) {
      if (inEditable) return;  // let browser handle native undo
      e.preventDefault(); doUndo(); return;
    }
    if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
      if (inEditable) return;  // let browser handle native redo
      e.preventDefault(); doRedo(); return;
    }
    if (e.key === 's') { e.preventDefault(); toast('נשמר אוטומטית'); return; }
    return;
  }

  // Don't intercept if typing in an input
  if (inEditable) return;

  // Only active in polish view with an active line
  if (state.view !== 'polish') return;

  if (state.activeIdx < 0) {
    if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); focusFirstLine(); }
    return;
  }

  if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); nextLine(); }
  else if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); prevLine(); }
  else if (e.key === 'Enter') { e.preventDefault(); approveAsIs(); }
  else if (e.key === ' ') { e.preventDefault(); skipCurrent(); }
  else if (e.key === 'g' || e.key === 'G') { e.preventDefault(); generateAlternatives(); }
  else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); fixCurrentLine(); }
  else if (e.key >= '1' && e.key <= '8') {
    e.preventDefault();
    const n = parseInt(e.key);
    const cards = $$('#altsContainer .alt-card');
    if (cards[n-1]) cards[n-1].click();
  }
}

function focusFirstLine() {
  const visible = getVisibleLines();
  if (visible.length > 0) openLine(visible[0].i);
}

function nextLine() {
  const visible = getVisibleLines();
  const curPos = visible.findIndex(x => x.i === state.activeIdx);
  if (curPos >= 0 && curPos < visible.length - 1) openLine(visible[curPos + 1].i);
}

function prevLine() {
  const visible = getVisibleLines();
  const curPos = visible.findIndex(x => x.i === state.activeIdx);
  if (curPos > 0) openLine(visible[curPos - 1].i);
}

// ═══════════════════════════════════════════════════════════════════
// MODE & VIEW SWITCHING
// ═══════════════════════════════════════════════════════════════════
function switchMode(mode) {
  if (state.mode === mode) return;
  
  // Remember current work before switching (not for breakout — it has no works)
  if (state.currentWork && state.mode !== 'breakout') {
    HatziDB.setLastWorkId(state.mode, state.currentWork.id);
  }

  // reset current work (going back to archive)
  state.currentWork = null;
  HatziDB.clearUndo();
  updateUndoButtons();

  // Apply all mode UI changes
  applyModeUI(mode);

  if (mode === 'breakout') {
    // Breakout goes straight to its own view
    renderBreakoutIdeas();
    switchView('breakout');
    return;
  }

  // refresh works list
  refreshWorksList();
  
  // Try to restore last work for this mode
  tryRestoreLastWork(mode);
}

async function tryRestoreLastWork(mode) {
  const lastId = await HatziDB.getLastWorkId(mode);
  if (!lastId) {
    switchView('works');
    return;
  }
  const work = await HatziDB.getWork(lastId);
  if (!work) {
    switchView('works');
    return;
  }
  // Don't auto-open — just show in archive, user can click
  switchView('works');
}

// Internal helper: apply mode UI changes WITHOUT clearing current work.
// Used by convertToMode and convertMomentTo after they create the new work.
function applyModeUI(mode) {
  state.mode = mode;
  $$('.mode-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.mode-btn[data-mode="${mode}"]`);
  if (btn) btn.classList.add('active');
  document.body.className = 'mode-' + mode;
  rebuildTagsForMode();
  
  const cfg = MODE_CONFIG[mode];
  if ($('hooksSection')) $('hooksSection').style.display = cfg.showHooks ? '' : 'none';
  if ($('postPatternSection')) $('postPatternSection').style.display = cfg.showPattern ? '' : 'none';
  if ($('avoidField')) $('avoidField').style.display = cfg.showAvoid ? '' : 'none';
  if ($('briefSection')) $('briefSection').style.display = cfg.showBrief ? '' : 'none';
  if ($('replyBriefSection')) $('replyBriefSection').style.display = cfg.showReply ? '' : 'none';
  if ($('draftSection')) $('draftSection').style.display = cfg.showDraft ? '' : 'none';
  
  if (cfg.showDraft) {
    $('draftTitle').textContent = (cfg.showHooks ? '3. ' : '2. ') + (mode === 'whatsapp' ? 'תסריט שיחה' : mode === 'post' ? 'פוסט' : 'תסריט');
    $('draftHint').textContent = mode === 'video' ? 'תסריט מלא עם תגיות ElevenLabs.' : mode === 'post' ? 'פוסט מלא של 200-350 מילה.' : 'תסריט שיחת ואטסאפ מובנה.';
  }
  
  const titleMap = { video: 'סרטונים', post: 'פוסטים', whatsapp: 'שיחות ואטסאפ', reply: 'תגובות', breakout: 'פריצה' };
  $('worksTitle').textContent = 'ארכיון — ' + titleMap[mode];
  
  // Toggle archive/moments/create/polish/export nav buttons based on mode
  // Breakout mode hides these — there's only the breakout view itself
  const archiveNav = document.querySelector('.nav-btn[data-view="works"]');
  const momentsNav = document.querySelector('.nav-btn[data-view="moments"]');
  const createNav = document.querySelector('.nav-btn[data-view="create"]');
  const polishNav = document.querySelector('.nav-btn[data-view="polish"]');
  const exportNav = document.querySelector('.nav-btn[data-view="export"]');
  const isBreakout = mode === 'breakout';
  [archiveNav, createNav, polishNav, exportNav].forEach(b => {
    if (b) b.style.display = isBreakout ? 'none' : '';
  });
  // Moments always visible (breakout feeds into it)
  if (momentsNav) momentsNav.style.display = '';
}

function switchView(view) {
  state.view = view;
  $$('.view').forEach(v => v.classList.add('hidden'));
  const viewEl = $('view-' + view);
  if (viewEl) viewEl.classList.remove('hidden');
  $$('.nav-btn').forEach(b => b.classList.remove('active'));
  const navBtn = document.querySelector(`.nav-btn[data-view="${view}"]`);
  if (navBtn) navBtn.classList.add('active');

  if (view === 'works') refreshWorksList();
  if (view === 'moments') refreshMomentsList();
  if (view === 'export') renderExport();
  if (view === 'polish') renderLines();
  if (view === 'breakout') renderBreakoutIdeas();
  if (view === 'perf') renderPerfBulkView();
}

function rebuildTagsForMode() {
  const cfg = MODE_CONFIG[state.mode];

  // hook tags (video only)
  state.hookTags = [];
  if (cfg.showHooks) {
    const container = $('hkTags');
    if (container) {
      container.innerHTML = '';
      cfg.hookTags.forEach(t => {
        const btn = document.createElement('button');
        btn.className = 'tag';
        btn.textContent = t;
        btn.onclick = () => toggleTag('hook', t, btn);
        container.appendChild(btn);
      });
    }
  }

  // script/draft tags
  state.scriptTags = [];
  const scContainer = $('scTags');
  if (scContainer) {
    scContainer.innerHTML = '';
    cfg.scriptTags.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'tag';
      btn.textContent = t;
      btn.onclick = () => toggleTag('script', t, btn);
      scContainer.appendChild(btn);
    });
  }

  // style tags (in workshop)
  state.styleMods = [];
  const stContainer = $('styleTags');
  if (stContainer) {
    stContainer.innerHTML = '';
    cfg.styleTags.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'style-tag';
      btn.textContent = t;
      btn.onclick = () => toggleStyleTag(t, btn);
      stContainer.appendChild(btn);
    });
  }

  // Breakout tags (separate container)
  state.breakoutTags = [];
  const brContainer = $('breakoutTags');
  if (brContainer && state.mode === 'breakout') {
    brContainer.innerHTML = '';
    cfg.styleTags.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'style-tag';
      btn.textContent = t;
      btn.onclick = () => toggleBreakoutTag(t, btn);
      brContainer.appendChild(btn);
    });
  }

  // draft button text
  document.querySelectorAll('button').forEach(b => {
    if (b.getAttribute('onclick') === 'genDraft()') {
      b.textContent = cfg.draftBtnText || '';
    }
  });
}

function toggleBreakoutTag(t, el) {
  const idx = state.breakoutTags.indexOf(t);
  if (idx >= 0) { state.breakoutTags.splice(idx, 1); el.classList.remove('on'); }
  else { state.breakoutTags.push(t); el.classList.add('on'); }
}

function toggleTag(kind, val, el) {
  const arr = kind === 'hook' ? state.hookTags : state.scriptTags;
  const idx = arr.indexOf(val);
  if (idx >= 0) { arr.splice(idx, 1); el.classList.remove('on'); }
  else { arr.push(val); el.classList.add('on'); }
}

function toggleStyleTag(t, el) {
  const idx = state.styleMods.indexOf(t);
  if (idx >= 0) { state.styleMods.splice(idx, 1); el.classList.remove('on'); }
  else { state.styleMods.push(t); el.classList.add('on'); }
}

function selectPattern(p, el) {
  state.selectedPattern = p;
  $$('.pattern-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
}

function selectDialogLevel(level, el) {
  state.dialogLevel = level;
  $$('.dialog-level-btn').forEach(b => b.classList.remove('on'));
  el.classList.add('on');
}

// ═══════════════════════════════════════════════════════════════════
// STATUS & MODEL
// ═══════════════════════════════════════════════════════════════════
function updateStatus() {
  if (state.apiKey) {
    $('statusDot').style.background = 'var(--gr)';
    $('statusText').textContent = 'מוכן';
  } else {
    $('statusDot').style.background = '#333';
    $('statusText').textContent = 'הכנס Key';
  }
}

async function saveModel() {
  state.model = $('modelSelect').value;
  await HatziDB.setSetting('model', state.model);
  toast('מודל עודכן: ' + state.model.replace('claude-', '').replace('-4-', ' 4.'));
}

async function saveApiKey() {
  const k = v('settingsApiKey');
  if (!k) { toast('הכנס key', 'error'); return; }
  state.apiKey = k;
  await HatziDB.setSetting('apiKey', k);
  $('settingsApiKey').value = '••••••••';
  updateStatus();
  toast('API key נשמר', 'success');
}

// ═══════════════════════════════════════════════════════════════════
// API CALLS
// ═══════════════════════════════════════════════════════════════════
// Track in-flight requests so we can cancel them when a new one starts.
// Keyed by taskType — pressing G twice will abort the first alternatives call.
const _inflight = {};

function _abortInflight(taskType) {
  if (taskType && _inflight[taskType]) {
    try { _inflight[taskType].abort(); } catch (_) {}
    delete _inflight[taskType];
  }
}

function abortAllRequests() {
  Object.keys(_inflight).forEach(_abortInflight);
}

async function callAPI(messages, maxTokens = 2500, taskType = null, modeOverride = null) {
  if (!state.apiKey) {
    toast('הכנס API key בהגדרות', 'error');
    openSettings();
    return null;
  }

  // Cancel any previous request of the same task type — prevents duplicate-cost races.
  _abortInflight(taskType);
  const ac = new AbortController();
  if (taskType) _inflight[taskType] = ac;

  $('statusDot').style.background = 'var(--ac)';
  $('statusText').textContent = 'עובד...';

  try {
    // Use modeOverride if explicitly provided — this prevents a race condition where
    // convertToMode/convertMomentTo were temporarily mutating state.mode during the await,
    // causing parallel API calls to receive the wrong system prompt.
    const effectiveMode = modeOverride || state.mode;
    let sysPrompt = MODE_CONFIG[effectiveMode].systemPrompt;

    // BREAKOUT TASKS: force no-context mode even if files are loaded.
    // The whole point of breakout is to escape the canon cage.
    const isBreakoutTask = taskType && ['breakoutIdeas', 'breakoutExpand', 'wildAngles'].includes(taskType);
    
    if (isBreakoutTask) {
      // Override system prompt with breakout SYS regardless of current mode
      if (typeof SYS_BREAKOUT !== 'undefined') {
        sysPrompt = SYS_BREAKOUT;
      }
    } else if (taskType && typeof shouldIncludeContext === 'function' && shouldIncludeContext(taskType)) {
      // Inject context if applicable (non-breakout only)
      const contextFiles = state.contextFiles || {};
      if (Object.keys(contextFiles).length > 0 && typeof buildContextBlock === 'function') {
        const contextBlock = buildContextBlock(contextFiles);
        if (contextBlock) {
          sysPrompt = sysPrompt + '\n\n' + contextBlock;
        }
      }

      // Feedback loop — inject top performers bank for creative generation tasks.
      // The model sees concrete examples of what worked from the user's own past content
      // and treats them as YES BANK (canonical good examples) rather than generic advice.
      const creativeTasks = ['draft', 'alternatives', 'hooks', 'angles', 'reply'];
      if (creativeTasks.includes(taskType) && typeof getFeedbackBlock === 'function') {
        try {
          const feedbackBlock = await getFeedbackBlock();
          if (feedbackBlock) {
            sysPrompt = sysPrompt + '\n\n' + feedbackBlock;
          }
        } catch (e) {
          // Don't fail the API call if feedback lookup breaks — log and continue.
          console.warn('feedback block error:', e);
        }
      }
    }

    const selectedModel = taskType ? resolveModel(taskType) : state.model;

    // Prompt caching — wrap system as content array with cache_control.
    // The system prompt + canon block is repeated identically across many calls;
    // caching cuts cost ~90% on those tokens after the first call (5-min TTL).
    // If sysPrompt is under the cache threshold (~1024 tokens), the API ignores cache_control silently.
    const systemPayload = [
      { type: 'text', text: sysPrompt, cache_control: { type: 'ephemeral' } }
    ];

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': state.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: selectedModel,
        max_tokens: maxTokens,
        system: systemPayload,
        messages: messages
      }),
      signal: ac.signal
    });

    const d = await r.json();

    if (!r.ok) {
      const msg = d.error?.message || `HTTP ${r.status}`;
      toast('שגיאת API: ' + msg, 'error');
      return null;
    }

    // Track cache savings — cache_read_input_tokens are billed at 10% of normal input tokens
    if (d.usage) {
      const cacheRead = d.usage.cache_read_input_tokens || 0;
      const cacheWrite = d.usage.cache_creation_input_tokens || 0;
      if (cacheRead > 0 || cacheWrite > 0) {
        state._cacheStats = state._cacheStats || { read: 0, write: 0 };
        state._cacheStats.read += cacheRead;
        state._cacheStats.write += cacheWrite;
      }
    }

    const text = d.content?.[0]?.text;
    if (!text) {
      toast('תשובה ריקה מהמודל', 'error');
      return null;
    }

    return text;
  } catch (e) {
    // AbortError is expected when we cancel — don't show as error to the user.
    if (e.name === 'AbortError') return null;
    toast('שגיאה: ' + e.message, 'error');
    return null;
  } finally {
    // Only clear if this is still the current in-flight for this task
    // (a newer request may have replaced us).
    if (taskType && _inflight[taskType] === ac) delete _inflight[taskType];
    updateStatus();
  }
}

// ═══════════════════════════════════════════════════════════════════
// WORKS LIST VIEW
// ═══════════════════════════════════════════════════════════════════
async function refreshWorksList() {
  const works = await HatziDB.listWorks(state.mode);
  const grid = $('worksGrid');
  const empty = $('worksEmpty');

  if (works.length === 0) {
    grid.style.display = 'none';
    empty.style.display = '';
    return;
  }

  grid.style.display = '';
  empty.style.display = 'none';
  
  // Fetch performance data for all works in parallel
  const perfMap = {};
  const perfs = await Promise.all(works.map(w => HatziDB.getPerformance(w.id)));
  works.forEach((w, i) => { if (perfs[i]) perfMap[w.id] = perfs[i]; });
  
  const modeIcon = { video: '🎬', post: '📝', whatsapp: '💬', reply: '💭' };
  
  grid.innerHTML = works.map(w => {
    const preview = w.lines.length > 0
      ? w.lines.slice(0, 2).map(l => stripTagsForDisplay(l.text || '')).join(' · ').substring(0, 120)
      : (w.brief?.topic ? w.brief.topic.substring(0, 120) : (w.brief?.externalPost ? 'תגובה ל: ' + w.brief.externalPost.substring(0, 80) : 'ריק'));
    const approved = w.lines.filter(l => l.approved).length;
    const total = w.lines.filter(l => !TAG_ONLY_RE.test(l.text || '')).length;
    const progress = total > 0 ? `${approved}/${total}` : 'לא התחיל';
    const date = new Date(w.updatedAt);
    const dateStr = date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const icon = modeIcon[w.mode] || '📄';
    const perf = perfMap[w.id];
    const isFullyApproved = total > 0 && approved === total;
    const perfIcon = perf ? '📈' : (isFullyApproved ? '➕' : '');
    const perfTitle = perf ? `${perf.views} צפיות · ${perf.shares} שיתופים` : (isFullyApproved ? 'הוסף ביצועים' : '');

    return `<div class="work-card" onclick="openWork('${w.id}')">
      <span class="wc-mode ${w.mode}">${icon}</span>
      <button class="wc-delete" onclick="event.stopPropagation();deleteWorkConfirm('${w.id}')" title="מחק">✕</button>
      ${perfIcon ? `<button class="wc-perf" onclick="event.stopPropagation();openPerfEntry('${w.id}')" title="${esc(perfTitle)}">${perfIcon}</button>` : ''}
      <h3>${esc(w.title || 'ללא כותרת')}</h3>
      <div class="wc-preview">${esc(preview)}</div>
      <div class="wc-meta">
        <span>📊 ${progress}</span>
        <span>📅 ${dateStr}</span>
        ${perf ? `<span style="color:var(--gr)">👁 ${perf.views.toLocaleString()}</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

async function newWork() {
  const work = await HatziDB.createWork(state.mode, 'עבודה חדשה — ' + new Date().toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }));
  state.currentWork = work;
  HatziDB.clearUndo();
  clearCreateForm();
  switchView('create');
}

async function openWork(id) {
  const work = await HatziDB.getWork(id);
  if (!work) { toast('העבודה לא נמצאה', 'error'); return; }
  state.currentWork = work;
  HatziDB.clearUndo();
  loadWorkToForm(work);
  
  // Remember as last work for this mode
  await HatziDB.setLastWorkId(state.mode, work.id);

  if (work.lines.length > 0) {
    switchView('polish');
  } else {
    switchView('create');
  }
}

async function deleteWorkConfirm(id) {
  if (!confirm('למחוק את העבודה הזו לגמרי? פעולה זו אינה הפיכה.')) return;
  await HatziDB.deleteWork(id);
  if (state.currentWork && state.currentWork.id === id) state.currentWork = null;
  refreshWorksList();
  toast('נמחק', 'success');
}

function clearCreateForm() {
  $('topic').value = '';
  $('chr').value = '';
  $('emo').value = '';
  $('avoid').value = '';
  $('selHook').value = '';
  $('anglesOut').innerHTML = '';
  $('anglesPicker').style.display = 'none';
  $('anglesSelected').style.display = 'none';
  $('hooksOut').innerHTML = '';
  $('hkSel').style.display = 'none';
  $('draftOut').innerHTML = '';
  $('draftToPol').style.display = 'none';
  $$('.tag.on').forEach(t => t.classList.remove('on'));
  state.hookTags = [];
  state.scriptTags = [];
  state.selectedPattern = 'auto';
  state.dialogLevel = 'medium';
  $$('.pattern-card').forEach(c => c.classList.remove('selected'));
  $$('.dialog-level-btn').forEach(b => b.classList.remove('on'));
  document.querySelector('.dialog-level-btn[data-level="medium"]')?.classList.add('on');
  // Reply mode
  if ($('replyPageName')) $('replyPageName').value = '';
  if ($('replyPostText')) $('replyPostText').value = '';
  if ($('replyCategory')) $('replyCategory').value = 'advisor';
  if ($('repliesOut')) $('repliesOut').innerHTML = '';
  if ($('repliesToPol')) $('repliesToPol').style.display = 'none';
}

function loadWorkToForm(work) {
  // Reply mode has its own brief
  if (work.mode === 'reply') {
    if ($('replyPageName')) $('replyPageName').value = work.brief?.pageName || '';
    if ($('replyPostText')) $('replyPostText').value = work.brief?.externalPost || '';
    if ($('replyCategory')) $('replyCategory').value = work.brief?.category || 'advisor';
  } else {
    $('topic').value = work.brief.topic || '';
    $('chr').value = work.brief.character || '';
    $('emo').value = work.brief.emotion || '';
    $('avoid').value = work.brief.avoid || '';
    $('selHook').value = work.selectedHook || '';

    if (work.angles && work.angles.length > 0) {
      renderAngles(work.angles.join('\n'));
      if (work.selectedAngle) {
        $('anglesSelected').style.display = '';
        $('anglesSelectedText').textContent = work.selectedAngle;
      }
    }

    if (work.hooks && work.hooks.length > 0) {
      $('hooksOut').innerHTML = `<div class="out"><div>${fmt(work.hooks.join('\n'))}</div></div>`;
      $('hkSel').style.display = '';
    }
  }

  if (work.lines && work.lines.length > 0) {
    $('draftOut').innerHTML = `<div class="out"><div>${fmt(work.lines.map(l => l.text).join('\n'))}</div></div>`;
    $('draftToPol').style.display = '';
  }
}

async function saveCurrentWork(reason = 'edit') {
  if (!state.currentWork) return;
  // sync brief from form
  if (state.mode === 'reply') {
    state.currentWork.brief = state.currentWork.brief || {};
    state.currentWork.brief.pageName = v('replyPageName');
    state.currentWork.brief.externalPost = v('replyPostText');
    state.currentWork.brief.category = v('replyCategory') || 'advisor';
    // auto-title from page name
    if (state.currentWork.title.startsWith('עבודה חדשה') && state.currentWork.brief.pageName) {
      state.currentWork.title = 'תגובה: ' + state.currentWork.brief.pageName;
    }
  } else {
    state.currentWork.brief.topic = v('topic');
    state.currentWork.brief.character = v('chr');
    state.currentWork.brief.emotion = v('emo');
    state.currentWork.brief.avoid = v('avoid');
    state.currentWork.selectedHook = v('selHook');

    // auto-title from topic if still default
    if (state.currentWork.title.startsWith('עבודה חדשה') && state.currentWork.brief.topic) {
      state.currentWork.title = state.currentWork.brief.topic.substring(0, 50);
    }
  }

  await HatziDB.updateWork(state.currentWork, reason);
}

// ═══════════════════════════════════════════════════════════════════
// STRIP TAGS FOR DISPLAY
// ═══════════════════════════════════════════════════════════════════
function stripTagsForDisplay(text) {
  if (!text) return '';
  return text.replace(TAG_STRIP_RE, '').trim().replace(/\s+/g, ' ');
}

// ═══════════════════════════════════════════════════════════════════
// CREATE VIEW: GENERATION
// ═══════════════════════════════════════════════════════════════════
async function genAngles() {
  if (!state.currentWork) {
    state.currentWork = await HatziDB.createWork(state.mode);
  }

  const brief = {
    topic: v('topic'),
    character: v('chr'),
    emotion: v('emo'),
    avoid: v('avoid')
  };

  if (!brief.topic) { toast('הכנס נושא', 'error'); return; }

  $('anglesOut').innerHTML = '<div class="loading">מייצר זוויות...</div>';
  const prompt = PROMPTS.angles[state.mode](brief);
  const result = await callAPI([{ role: 'user', content: prompt }], 1500, 'angles');

  if (!result) { $('anglesOut').innerHTML = ''; return; }

  const angles = result.split('\n').filter(l => /^\d[\.\)]/.test(l.trim())).map(l => l.replace(/^\d[\.\)]\s*/, '').trim());
  state.currentWork.angles = angles;
  await saveCurrentWork('angles_generated');
  renderAngles(result);
}

function renderAngles(text) {
  $('anglesOut').innerHTML = `<div class="out"><div>${fmt(text)}</div></div>`;
  const angleLines = text.split('\n').filter(l => /^\d[\.\)]/.test(l.trim()));
  if (angleLines.length === 0) return;

  const picker = $('anglesPicker');
  picker.style.display = '';
  picker.innerHTML = '<div style="font-size:11px;color:var(--tx2);margin-bottom:6px">👇 בחר זווית:</div>';
  angleLines.forEach((line) => {
    const clean = line.replace(/^\d[\.\)]\s*/, '').trim();
    const div = document.createElement('div');
    div.className = 'angle-sel';
    div.innerHTML = `<div class="check"></div><div style="flex:1">${esc(clean)}</div>`;
    div.onclick = () => pickAngle(clean, div);
    picker.appendChild(div);
  });
}

async function pickAngle(text, el) {
  if (!state.currentWork) return;
  state.currentWork.selectedAngle = text;
  $$('.angle-sel').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
  $('anglesSelected').style.display = '';
  $('anglesSelectedText').textContent = text;
  await saveCurrentWork('angle_selected');
}

async function genHooks() {
  if (!state.currentWork) { toast('צור עבודה חדשה קודם', 'error'); return; }
  const brief = state.currentWork.brief;
  if (!brief.topic) { toast('הכנס נושא', 'error'); return; }

  $('hooksOut').innerHTML = '<div class="loading">מייצר Hooks...</div>';
  const prompt = PROMPTS.hooks(brief, state.currentWork.selectedAngle, brief.avoid, state.hookTags.join(', '));
  const result = await callAPI([{ role: 'user', content: prompt }], 2000, 'hooks');

  if (!result) { $('hooksOut').innerHTML = ''; return; }

  const hooks = result.split('\n').filter(l => /^\d+[\.\)]/.test(l.trim())).map(l => l.replace(/^\d+[\.\)]\s*/, '').trim());
  state.currentWork.hooks = hooks;
  await saveCurrentWork('hooks_generated');

  $('hooksOut').innerHTML = `<div class="out"><button class="btn2 bsm" id="copyHooksBtn" style="position:absolute;top:6px;left:6px">העתק</button><div style="padding-left:55px">${fmt(result)}</div></div>`;
  $('copyHooksBtn').onclick = function() { copyText(this, result); };
  $('hkSel').style.display = '';
}

async function genDraft() {
  if (!state.currentWork) { toast('צור עבודה חדשה קודם', 'error'); return; }
  const brief = state.currentWork.brief;
  if (!brief.topic) { toast('הכנס נושא', 'error'); return; }

  let prompt;
  if (state.mode === 'video') {
    const hook = v('selHook');
    state.currentWork.selectedHook = hook;
    prompt = PROMPTS.draft.video(brief, state.currentWork.selectedAngle, hook, state.scriptTags.join(', '));
  } else if (state.mode === 'post') {
    const patternMap = {
      auto: '', 
      anecdote: 'דפוס 1: אנקדוטה מתרחבת',
      observation: 'דפוס 2: תצפית על אחרים שהיא על עצמך',
      dialog: 'דפוס 3: דיאלוג-שמחליף-פסקה'
    };
    const dialogMap = {
      heavy: 'הרבה דיאלוג (יחידה מרכזית)',
      medium: 'דיאלוג בינוני (מופיע אבל לא מרכזי)',
      light: 'מעט דיאלוג (רפליקה אחת לכל היותר)',
      none: 'בלי דיאלוג בכלל'
    };
    prompt = PROMPTS.draft.post(
      brief,
      state.currentWork.selectedAngle,
      patternMap[state.selectedPattern],
      dialogMap[state.dialogLevel]
    );
  } else {
    prompt = PROMPTS.draft.whatsapp(brief, state.currentWork.selectedAngle);
  }

  $('draftOut').innerHTML = '<div class="loading">מייצר טיוטה...</div>';
  const result = await callAPI([{ role: 'user', content: prompt }], 4000, 'draft');

  if (!result) { $('draftOut').innerHTML = ''; return; }

  // split into lines and store
  const lines = splitTextToLines(result, state.mode);
  state.currentWork.lines = lines.map(text => ({ text, approved: false }));
  await saveCurrentWork('draft_generated');

  $('draftOut').innerHTML = `<div class="out"><button class="btn2 bsm" id="copyDraftBtn" style="position:absolute;top:6px;left:6px">העתק</button><div style="padding-left:55px">${fmt(result)}</div></div>`;
  $('copyDraftBtn').onclick = function() { copyText(this, result); };
  $('draftToPol').style.display = '';
  
  // Auto-run canon check if context files exist
  if (state.autoCanonCheck && Object.keys(state.contextFiles || {}).length > 0) {
    toast('בודק קנון ברקע...');
    // don't await - run in background
    runCanonCheckSilent(result).then(issues => {
      if (issues && issues.length > 0) {
        const critical = issues.filter(i => i.severity === 'high').length;
        if (critical > 0) {
          toast(`⚠ ${critical} סתירות קריטיות — לחץ 🔍 בליטוש`, 'error');
        } else {
          toast(`${issues.length} הערות קנון — לחץ 🔍 לפרטים`);
        }
      }
    });
  }
}

function splitTextToLines(text, mode) {
  if (mode === 'post') {
    // Split by double newlines (paragraphs), keep non-empty
    return text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
  } else if (mode === 'whatsapp') {
    // Keep every non-empty line (structure matters)
    return text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  } else if (mode === 'reply') {
    // Each reply is a paragraph block (separated by double newlines or numbered)
    const chunks = text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
    // Strip leading numbering like "1. " or "1) "
    return chunks.map(c => c.replace(/^\d+[\.\)]\s*/, '').trim());
  } else {
    // video: every non-empty line
    return text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  }
}

async function toPolish() {
  await saveCurrentWork('to_polish');
  switchView('polish');
}

function copyText(btn, text) {
  navigator.clipboard.writeText(text);
  btn.textContent = '✓';
  setTimeout(() => btn.textContent = 'העתק', 1500);
}

function openPasteImport() {
  $('pasteTitle').value = '';
  $('pasteImportText').value = '';
  openModal('pasteImportModal');
}

async function confirmPasteImport() {
  const text = $('pasteImportText').value.trim();
  if (!text) { toast('אין טקסט', 'error'); return; }

  const title = $('pasteTitle').value.trim() || text.substring(0, 50);
  const work = await HatziDB.createWork(state.mode, title);
  work.lines = splitTextToLines(text, state.mode).map(t => ({ text: t, approved: false }));
  await HatziDB.updateWork(work, 'imported');

  closeModals();
  state.currentWork = work;
  HatziDB.clearUndo();
  switchView('polish');
  toast('ייובא — ' + work.lines.length + ' יחידות', 'success');
}

// ═══════════════════════════════════════════════════════════════════
// POLISH VIEW: RENDERING LINES
// ═══════════════════════════════════════════════════════════════════
function getVisibleLines() {
  if (!state.currentWork) return [];
  return state.currentWork.lines
    .map((ln, i) => ({ line: ln, i }))
    .filter(({ line }) => !line.approved && !TAG_ONLY_RE.test(line.text || ''));
}

function getApprovedLines() {
  if (!state.currentWork) return [];
  return state.currentWork.lines
    .map((ln, i) => ({ line: ln, i }))
    .filter(({ line }) => line.approved);
}

function renderLines() {
  if (!state.currentWork) {
    $('linesEmpty').style.display = '';
    $('linesList').innerHTML = '';
    $('allDone').style.display = 'none';
    return;
  }

  const visible = getVisibleLines();
  const approved = getApprovedLines();
  const total = state.currentWork.lines.filter(l => !TAG_ONLY_RE.test(l.text || '')).length;

  $('approvedCnt').textContent = approved.length;
  $('totalCnt').textContent = total;
  $('progressFill').style.width = (total > 0 ? (approved.length / total * 100) : 0) + '%';

  if (state.currentWork.lines.length === 0) {
    $('linesEmpty').style.display = '';
    $('linesList').innerHTML = '';
    $('allDone').style.display = 'none';
    return;
  }

  $('linesEmpty').style.display = 'none';

  if (visible.length === 0 && approved.length > 0) {
    $('allDone').style.display = '';
    $('linesList').innerHTML = '';
    return;
  }

  $('allDone').style.display = 'none';

  // Build callbacks map for quick lookup
  const callbackMap = {};
  (state.currentWork.callbacks || []).forEach(cb => {
    if (!callbackMap[cb.lineA]) callbackMap[cb.lineA] = [];
    if (!callbackMap[cb.lineB]) callbackMap[cb.lineB] = [];
    callbackMap[cb.lineA].push(cb);
    callbackMap[cb.lineB].push(cb);
  });

  $('linesList').innerHTML = visible.map(({ line, i }) => {
    const active = i === state.activeIdx ? 'active' : '';
    const selected = state.selectedLines.has(i) ? 'selected' : '';
    const isTagOnly = TAG_ONLY_RE.test(line.text || '');
    const text = isTagOnly
      ? `<em style="color:var(--tx3)">${esc(line.text)}</em>`
      : esc(line.text);
    const score = line.score;
    const scoreBadge = score ? `<div class="ln-score s${score}" title="${esc(line.scoreReason || '')}">${score}</div>` : '';
    const cb = callbackMap[i];
    const cbIndicator = cb ? `<div class="ln-callback" title="${esc(cb.map(c => c.note).join('; '))}">🔗</div>` : '';

    return `<div class="ln-item ${active} ${selected}" data-i="${i}" onclick="openLine(${i})">
      <div class="ln-sel" onclick="event.stopPropagation();toggleSel(${i})"></div>
      <div class="ln-txt">${text}</div>
      <button class="ln-approve" onclick="event.stopPropagation();approveLineQuick(${i})" title="אשר">✓</button>
      <button class="ln-fix" onclick="event.stopPropagation();fixLineQuick(${i}, this)" title="תקן שורה">🔧</button>
      ${scoreBadge}
      ${cbIndicator}
    </div>`;
  }).join('');

  updateBulkBar();
}

function openLine(idx) {
  if (!state.currentWork || !state.currentWork.lines[idx]) return;

  // Bug #6/#18 — warn before discarding unsaved textarea content.
  // Returning false here prevents navigation and keeps the user in the dirty line.
  if (state.activeIdx !== idx && !confirmAbandonDirty()) return;

  state.activeIdx = idx;
  const line = state.currentWork.lines[idx];

  $('wkEmpty').style.display = 'none';
  $('wkContent').style.display = '';

  // set context
  const before = idx > 0 ? state.currentWork.lines[idx - 1] : null;
  const after = idx < state.currentWork.lines.length - 1 ? state.currentWork.lines[idx + 1] : null;
  $('wkCtx').innerHTML = [
    before ? `<div class="ctx-line ctx-before">↑ ${esc(stripTagsForDisplay(before.text).substring(0, 100))}</div>` : '',
    `<div class="ctx-line" style="color:var(--ac);font-weight:600">● ${esc(stripTagsForDisplay(line.text).substring(0, 100))}</div>`,
    after ? `<div class="ctx-line ctx-after">↓ ${esc(stripTagsForDisplay(after.text).substring(0, 100))}</div>` : ''
  ].filter(Boolean).join('');

  // line num
  $('wkLineNum').textContent = `#${idx + 1}`;

  // editable
  $('wkEditable').value = line.text;
  clearDirty();   // fresh line — no unsaved changes yet

  $('selTool').classList.remove('show');
  state.selRange = null;

  // Bug #16 — restore persisted freeText so it survives line navigation
  const ftEl = $('freeText');
  if (ftEl && state._freeTextValue != null) {
    ftEl.value = state._freeTextValue;
  }

  // clear alts
  $('altsContainer').innerHTML = '<div class="alts-empty">לחץ "ייצר חלופות" או <kbd>G</kbd></div>';

  // update active state in list
  renderLines();
}

function checkSelection() {
  const ta = $('wkEditable');
  const start = ta.selectionStart;
  const end = ta.selectionEnd;

  if (start !== end) {
    const selected = ta.value.substring(start, end);
    state.selRange = { start, end, text: selected };
    $('selTool').classList.add('show');
    $('selInfo').textContent = `נבחר: "${selected.substring(0, 40)}${selected.length > 40 ? '...' : ''}"`;
  } else {
    state.selRange = null;
    $('selTool').classList.remove('show');
  }
}

function replaceSelection() {
  if (!state.selRange) return;
  // generate alternatives for selection only
  generateAlternatives(true);
}

// ═══════════════════════════════════════════════════════════════════
// LINE ACTIONS
// ═══════════════════════════════════════════════════════════════════
function toggleSel(i) {
  if (state.selectedLines.has(i)) state.selectedLines.delete(i);
  else state.selectedLines.add(i);
  renderLines();
}

function updateBulkBar() {
  const bar = $('bulkBar');
  if (state.selectedLines.size > 0) {
    bar.classList.add('show');
    $('selCnt').textContent = state.selectedLines.size;
  } else {
    bar.classList.remove('show');
  }
}

function clearSelection() {
  state.selectedLines.clear();
  renderLines();
}

async function approveSelected() {
  if (state.selectedLines.size === 0) return;
  snapshotForUndo();
  state.selectedLines.forEach(i => {
    if (state.currentWork.lines[i]) state.currentWork.lines[i].approved = true;
  });
  state.selectedLines.clear();
  await saveCurrentWork('bulk_approve');
  renderLines();
  toast('אושרו', 'success');
}

async function deleteSelected() {
  if (state.selectedLines.size === 0) return;
  if (!confirm(`למחוק ${state.selectedLines.size} שורות?`)) return;
  snapshotForUndo();
  const sorted = [...state.selectedLines].sort((a, b) => b - a);
  sorted.forEach(i => state.currentWork.lines.splice(i, 1));
  state.selectedLines.clear();
  state.activeIdx = -1;
  invalidateCanonCheck();   // Bug #8 — text removed, old check is stale
  $('wkEmpty').style.display = '';
  $('wkContent').style.display = 'none';
  await saveCurrentWork('bulk_delete');
  renderLines();
  toast('נמחקו', 'success');
}

async function approveLineQuick(i) {
  if (!state.currentWork.lines[i]) return;
  snapshotForUndo();
  state.currentWork.lines[i].approved = true;
  await saveCurrentWork('line_approved');
  renderLines();
}

async function approveAsIs() {
  if (state.activeIdx < 0) return;
  snapshotForUndo();
  state.currentWork.lines[state.activeIdx].approved = true;
  await saveCurrentWork('line_approved');
  autoAdvance();
}

async function saveEditAndApprove() {
  if (state.activeIdx < 0) return;
  const newText = $('wkEditable').value.trim();
  if (!newText) { toast('טקסט ריק', 'error'); return; }
  snapshotForUndo();
  state.currentWork.lines[state.activeIdx].text = newText;
  state.currentWork.lines[state.activeIdx].approved = true;
  // invalidate score (edited)
  delete state.currentWork.lines[state.activeIdx].score;
  // Bug #8 — invalidate canon check because the text changed
  invalidateCanonCheck();
  clearDirty();
  await saveCurrentWork('line_approved');
  autoAdvance();
}

function skipCurrent() {
  if (state.activeIdx < 0) return;
  nextLine();
}

async function deleteCurrent() {
  if (state.activeIdx < 0) return;
  if (!confirm('למחוק את השורה?')) return;
  snapshotForUndo();
  state.currentWork.lines.splice(state.activeIdx, 1);
  state.activeIdx = -1;
  invalidateCanonCheck();   // Bug #8 — text removed, old check is stale
  clearDirty();              // line is gone, dirty state has no meaning
  $('wkEmpty').style.display = '';
  $('wkContent').style.display = 'none';
  await saveCurrentWork('line_deleted');
  renderLines();
}

function autoAdvance() {
  const visible = getVisibleLines();
  if (visible.length === 0) {
    state.activeIdx = -1;
    $('wkEmpty').style.display = '';
    $('wkContent').style.display = 'none';
    renderLines();
  } else {
    // find next unapproved index >= current
    const cur = state.activeIdx;
    let next = visible.find(x => x.i >= cur);
    if (!next) next = visible[0];
    openLine(next.i);
  }
}

// ═══════════════════════════════════════════════════════════════════
// ALTERNATIVES & FIX
// ═══════════════════════════════════════════════════════════════════
async function generateAlternatives(forSelectionOnly = false) {
  if (state.activeIdx < 0) return;

  // Note: previously had `const ctx = buildContext(...)` here but it was never used —
  // the alternatives prompt only consumes the target line + fullScript. Removed dead code.
  const fullScript = state.currentWork.lines.map((l, i) => `${i+1}. ${l.text}${l.approved ? ' ✓' : ''}`).join('\n');
  
  let targetText = $('wkEditable').value;
  if (forSelectionOnly && state.selRange) {
    targetText = state.selRange.text;
  }

  const prompt = PROMPTS.alternatives(
    `השורה הנוכחית: "${targetText}"`,
    state.varietyMode,
    state.styleMods.join(', '),
    v('freeText'),
    state.mode,
    fullScript,
    state.activeIdx,        // tell prompt which line to mark in fullScript
    state.altCount || 5     // how many alternatives to request
  );

  $('altsContainer').innerHTML = '<div class="loading">מייצר חלופות...</div>';
  const result = await callAPI([{ role: 'user', content: prompt }], 2000, 'alternatives');
  if (!result) { $('altsContainer').innerHTML = '<div class="alts-empty">שגיאה</div>'; return; }

  let alts = result.split('\n').filter(l => /^\d+[\.\)]/.test(l.trim())).map(l => l.replace(/^\d+[\.\)]\s*/, '').trim()).filter(l => l);

  // Dedup near-identical alternatives — sometimes the model returns 2 paraphrases of the same idea.
  // Simple approach: dedup by case-folded normalized prefix (first 20 chars after whitespace collapse).
  const seen = new Set();
  alts = alts.filter(a => {
    const key = a.replace(/\s+/g, ' ').trim().substring(0, 20).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (alts.length === 0) {
    $('altsContainer').innerHTML = '<div class="alts-empty">לא נמצאו חלופות תקינות</div>';
    return;
  }

  $('altsContainer').innerHTML = alts.map((alt, i) => `
    <div class="alt-card" onclick="applyAlternative(${i}, ${forSelectionOnly})">
      <div class="alt-num">${i+1}</div>
      <div class="alt-txt">${esc(alt)}</div>
    </div>
  `).join('');

  // store alts for keyboard access
  window._currentAlts = { alts, forSelectionOnly };
}

function applyAlternative(idx, forSelectionOnly) {
  const { alts } = window._currentAlts || { alts: [] };
  if (!alts[idx]) return;

  const ta = $('wkEditable');
  if (forSelectionOnly && state.selRange) {
    const before = ta.value.substring(0, state.selRange.start);
    const after = ta.value.substring(state.selRange.end);
    ta.value = before + alts[idx] + after;
    state.selRange = null;
    $('selTool').classList.remove('show');
  } else {
    ta.value = alts[idx];
  }
  ta.focus();
  markDirty();   // alt was inserted but not saved yet — flag it
  toast('הוחלף — אל תשכח לשמור', 'success');
}

async function fixCurrentLine() {
  if (state.activeIdx < 0) return;
  const ctx = buildContext(state.activeIdx);
  const currentText = $('wkEditable').value;

  // fullScript intentionally not passed — fix is local, ctx is enough.
  // Saves tokens AND focuses the model on the line itself.
  const prompt = PROMPTS.fixLine(ctx, currentText, state.mode);
  $('altsContainer').innerHTML = '<div class="loading">מתקן...</div>';

  const result = await callAPI([{ role: 'user', content: prompt }], 800, 'fix');
  if (!result) { $('altsContainer').innerHTML = '<div class="alts-empty">שגיאה</div>'; return; }

  const cleaned = result.trim().replace(/^["'"'«]+|["'"'»]+$/g, '');

  $('wkEditable').value = cleaned;
  markDirty();   // user-visible reminder that the textarea changed
  $('altsContainer').innerHTML = `<div class="alts-empty" style="color:var(--gr);border-color:var(--gr)">✓ גרסה משופרת הוחלה. לחץ "שמור & אשר" אם נראית לך.</div>`;
  toast('שורה תוקנה', 'success');
}

async function fixLineQuick(idx, btn) {
  if (!state.currentWork.lines[idx]) return;
  btn.classList.add('loading');
  btn.textContent = '⌛';

  const ctx = buildContext(idx);
  // fullScript intentionally not passed (see fixCurrentLine).
  const prompt = PROMPTS.fixLine(ctx, state.currentWork.lines[idx].text, state.mode);

  const result = await callAPI([{ role: 'user', content: prompt }], 800, 'fix');
  btn.classList.remove('loading');
  btn.textContent = '🔧';

  if (!result) return;

  const cleaned = result.trim().replace(/^["'"'«]+|["'"'»]+$/g, '');
  snapshotForUndo();
  state.currentWork.lines[idx].text = cleaned;
  delete state.currentWork.lines[idx].score;
  // Invalidate canon check because the text changed (Bug #8).
  invalidateCanonCheck();
  await saveCurrentWork('line_fixed');
  renderLines();
  toast('תוקן', 'success');
}

function buildContext(idx) {
  const lines = state.currentWork.lines;
  const isContent = t => t && !TAG_ONLY_RE.test(t);

  // Mode-aware context size:
  // - post: 1 paragraph each side (paragraphs are already 50-250 words; more = bloat)
  // - whatsapp: 5 lines each side (each line is a tiny chat message; need more to see flow)
  // - video/reply/etc: 3 lines each side (sentence-level units)
  const ctxSize = state.mode === 'post' ? 1 : state.mode === 'whatsapp' ? 5 : 3;

  // Walk back/forward collecting up to ctxSize CONTENT lines (skip tag-only like [exhales]).
  // Old version included [exhales]/[sighs] etc. as context, polluting the prompt.
  const beforeArr = [];
  for (let i = idx - 1; i >= 0 && beforeArr.length < ctxSize; i--) {
    if (isContent(lines[i].text)) beforeArr.unshift(lines[i].text);
  }
  const afterArr = [];
  for (let i = idx + 1; i < lines.length && afterArr.length < ctxSize; i++) {
    if (isContent(lines[i].text)) afterArr.push(lines[i].text);
  }

  return `לפני:\n${beforeArr.join('\n')}\n---\nאחרי:\n${afterArr.join('\n')}`;
}

// ═══════════════════════════════════════════════════════════════════
// SCORING & CALLBACKS
// ═══════════════════════════════════════════════════════════════════
async function scoreAll() {
  if (!state.currentWork || state.currentWork.lines.length === 0) return;

  const visibleLines = state.currentWork.lines
    .map((l, i) => ({ text: l.text, idx: i }))
    .filter(l => !TAG_ONLY_RE.test(l.text || ''));

  if (visibleLines.length === 0) return;

  toast('מדרג שורות...');
  const prompt = PROMPTS.score(state.mode, visibleLines.map(l => l.text));
  const result = await callAPI([{ role: 'user', content: prompt }], 2000, 'score');

  if (!result) return;

  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('no json');
    const data = JSON.parse(jsonMatch[0]);
    if (!data.scores || !Array.isArray(data.scores)) throw new Error('invalid format');

    snapshotForUndo();
    data.scores.forEach(s => {
      const lineNum = s.line - 1;
      if (lineNum >= 0 && lineNum < visibleLines.length) {
        const actualIdx = visibleLines[lineNum].idx;
        state.currentWork.lines[actualIdx].score = s.score;
        state.currentWork.lines[actualIdx].scoreReason = s.reason;
      }
    });
    await saveCurrentWork('scored');
    renderLines();
    toast('דרוג הושלם', 'success');
  } catch (e) {
    toast('שגיאה בפענוח הציונים', 'error');
  }
}

async function detectCallbacks() {
  if (!state.currentWork || state.currentWork.lines.length === 0) return;

  const lines = state.currentWork.lines.map(l => l.text);
  toast('מחפש callbacks...');
  const prompt = PROMPTS.callbacks(lines);
  const result = await callAPI([{ role: 'user', content: prompt }], 1500, 'callbacks');

  if (!result) return;

  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('no json');
    const data = JSON.parse(jsonMatch[0]);
    if (!data.callbacks || !Array.isArray(data.callbacks)) throw new Error('invalid format');

    // convert 1-based to 0-based
    state.currentWork.callbacks = data.callbacks.map(cb => ({
      lineA: cb.lineA - 1,
      lineB: cb.lineB - 1,
      type: cb.type,
      note: cb.note
    }));
    await saveCurrentWork('callbacks_detected');
    renderLines();
    toast(`נמצאו ${data.callbacks.length} callbacks`, 'success');
  } catch (e) {
    toast('שגיאה בפענוח', 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════
// RESET / PASTE-EDIT / APPROVED MODAL
// ═══════════════════════════════════════════════════════════════════
async function resetApprovals() {
  if (!state.currentWork) return;
  if (!confirm('אפס את כל השורות ללא מאושרות?')) return;
  snapshotForUndo();
  state.currentWork.lines.forEach(l => l.approved = false);
  state.activeIdx = -1;
  $('wkEmpty').style.display = '';
  $('wkContent').style.display = 'none';
  await saveCurrentWork('reset_approvals');
  renderLines();
}

function togglePasteEdit() {
  const pasteEdit = $('pasteEdit');
  const linesList = $('linesList');
  if (pasteEdit.style.display === 'none') {
    pasteEdit.style.display = '';
    linesList.style.display = 'none';
    $('linesEmpty').style.display = 'none';
    $('allDone').style.display = 'none';
    $('pasteText').value = state.currentWork ? state.currentWork.lines.map(l => l.text).join('\n') : '';
  } else {
    pasteEdit.style.display = 'none';
    linesList.style.display = '';
    renderLines();
  }
}

async function savePasteEdit() {
  if (!state.currentWork) return;
  const text = $('pasteText').value.trim();
  if (!text) { toast('טקסט ריק', 'error'); return; }
  snapshotForUndo();
  state.currentWork.lines = splitTextToLines(text, state.mode).map(t => ({ text: t, approved: false }));
  state.currentWork.callbacks = [];
  state.activeIdx = -1;
  $('wkEmpty').style.display = '';
  $('wkContent').style.display = 'none';
  await saveCurrentWork('text_edited');
  togglePasteEdit();
  toast('הטקסט עודכן', 'success');
}

function showApprovedModal() {
  const approved = getApprovedLines();
  if (approved.length === 0) { toast('אין שורות מאושרות'); return; }

  $('approvedBody').innerHTML = approved.map(({ line, i }) =>
    `<div class="modal-line"><span class="mline-num">#${i+1}</span>${esc(line.text)}</div>`
  ).join('');
  openModal('approvedModal');
}

// ═══════════════════════════════════════════════════════════════════
// UNDO / REDO
// ═══════════════════════════════════════════════════════════════════
function snapshotForUndo() {
  if (!state.currentWork) return;
  HatziDB.pushUndo(state.currentWork);
  updateUndoButtons();
}

async function doUndo() {
  if (!HatziDB.canUndo() || !state.currentWork) return;
  const prev = HatziDB.popUndo(state.currentWork);
  if (!prev) return;
  state.currentWork = prev;
  await HatziDB.updateWork(state.currentWork, 'undo');
  state.activeIdx = -1;
  $('wkEmpty').style.display = '';
  $('wkContent').style.display = 'none';
  renderLines();
  updateUndoButtons();
  toast('בוטל');
}

async function doRedo() {
  if (!HatziDB.canRedo() || !state.currentWork) return;
  const next = HatziDB.popRedo(state.currentWork);
  if (!next) return;
  state.currentWork = next;
  await HatziDB.updateWork(state.currentWork, 'redo');
  state.activeIdx = -1;
  $('wkEmpty').style.display = '';
  $('wkContent').style.display = 'none';
  renderLines();
  updateUndoButtons();
  toast('חזר');
}

function updateUndoButtons() {
  $('undoBtn').disabled = !HatziDB.canUndo();
  $('redoBtn').disabled = !HatziDB.canRedo();
}

// ═══════════════════════════════════════════════════════════════════
// EXPORT VIEW
// ═══════════════════════════════════════════════════════════════════
function renderExport() {
  const fmt = $('exportFormat');
  fmt.innerHTML = '';

  if (!state.currentWork || state.currentWork.lines.length === 0) {
    $('exportContent').innerHTML = '<div class="desc">אין תוכן לייצוא.</div>';
    return;
  }

  const mode = state.mode;
  
  // Cross-mode conversion bar (only for modes where conversion makes sense)
  if (['video', 'post', 'whatsapp'].includes(mode)) {
    const approvedCount = state.currentWork.lines.filter(l => l.approved).length;
    if (approvedCount > 0) {
      const bar = document.createElement('div');
      bar.className = 'cross-mode-bar';
      bar.innerHTML = `
        <span class="cm-label">🔁 הפך ל:</span>
        ${mode !== 'video' ? '<button onclick="convertToMode(\'video\')">🎬 סרטון</button>' : ''}
        ${mode !== 'post' ? '<button onclick="convertToMode(\'post\')">📝 פוסט</button>' : ''}
        ${mode !== 'whatsapp' ? '<button onclick="convertToMode(\'whatsapp\')">💬 ואטסאפ</button>' : ''}
      `;
      fmt.appendChild(bar);
    }
  }

  // buttons based on mode
  if (mode === 'video') {
    addExportBtn('🎤 ElevenLabs', () => exportContent('eleven'));
    addExportBtn('📝 נקי (בלי תגיות)', () => exportContent('clean'));
    addExportBtn('🎬 SRT (כתוביות)', () => exportContent('srt'));
    addExportBtn('📋 הכל כטקסט', () => exportContent('raw'));
  } else if (mode === 'post') {
    addExportBtn('📝 פוסט לפייסבוק', () => exportContent('post'));
    addExportBtn('📋 טקסט נקי', () => exportContent('clean'));
  } else if (mode === 'reply') {
    addExportBtn('💭 כל התגובות (מופרדות)', () => exportContent('replies'));
    addExportBtn('📋 טקסט נקי', () => exportContent('clean'));
  } else {
    addExportBtn('💬 תסריט מובנה', () => exportContent('whatsapp'));
    addExportBtn('📋 טקסט נקי', () => exportContent('clean'));
  }

  // default display
  const defaultFmt = mode === 'video' ? 'clean' 
                   : mode === 'post' ? 'post' 
                   : mode === 'reply' ? 'replies' 
                   : 'whatsapp';
  exportContent(defaultFmt);
}

function addExportBtn(label, handler) {
  const btn = document.createElement('button');
  btn.className = 'btn2';
  btn.textContent = label;
  btn.onclick = handler;
  $('exportFormat').appendChild(btn);
}

function exportContent(format) {
  if (!state.currentWork) return;
  const approved = state.currentWork.lines.filter(l => l.approved);
  const lines = approved.length > 0 ? approved : state.currentWork.lines;

  let output = '';
  const texts = lines.map(l => l.text);

  if (format === 'clean') {
    const sep = (state.mode === 'post' || state.mode === 'reply') ? '\n\n' : '\n';
    output = texts.map(t => stripTagsForDisplay(t)).filter(t => t).join(sep);
  } else if (format === 'raw') {
    output = texts.join('\n');
  } else if (format === 'eleven') {
    output = texts.join('\n');
  } else if (format === 'srt') {
    output = buildSRT(texts);
  } else if (format === 'post') {
    output = texts.join('\n\n');
  } else if (format === 'whatsapp') {
    output = texts.join('\n');
  } else if (format === 'replies') {
    // Each reply separated by a clear divider
    output = texts.map((t, i) => `━━━ תגובה ${i + 1} ━━━\n${t}`).join('\n\n');
  }

  const wordCount = output.split(/\s+/).filter(w => w).length;
  const readingTime = Math.ceil(wordCount / 150); // 150 wpm speaking

  $('exportContent').innerHTML = `
    <div class="stats">${lines.length} יחידות · ${wordCount} מילים · ~${readingTime} דקות דיבור</div>
    <div style="display:flex;gap:6px;margin:10px 0">
      <button class="btn" onclick="copyExport()">📋 העתק</button>
      <button class="btn2" onclick="downloadExport('${format}')">💾 הורד</button>
    </div>
    <textarea id="exportText" class="ta" rows="20" style="font-family:monospace;font-size:12px">${esc(output)}</textarea>
  `;
}

function buildSRT(lines) {
  let srt = '';
  let time = 0;
  lines.forEach((line, i) => {
    const duration = Math.max(2, Math.ceil(line.length / 15));
    const start = formatSRTTime(time);
    const end = formatSRTTime(time + duration);
    srt += `${i+1}\n${start} --> ${end}\n${stripTagsForDisplay(line)}\n\n`;
    time += duration;
  });
  return srt;
}

function formatSRTTime(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},000`;
}

function copyExport() {
  const text = $('exportText').value;
  navigator.clipboard.writeText(text);
  toast('הועתק', 'success');
}

function downloadExport(format) {
  const text = $('exportText').value;
  const ext = format === 'srt' ? 'srt' : 'txt';
  const title = state.currentWork.title.replace(/[^\w\u0590-\u05FF\s]/g, '').substring(0, 30);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════════════
// MODALS
// ═══════════════════════════════════════════════════════════════════
function openModal(id) {
  $('modalOverlay').classList.add('show');
  $(id).classList.add('show');
}

function closeModals() {
  $('modalOverlay').classList.remove('show');
  $$('.modal').forEach(m => m.classList.remove('show'));
}

async function openSettings() {
  $('settingsApiKey').value = state.apiKey ? '••••••••' : '';
  openModal('settingsModal');
}

// ═══════════════════════════════════════════════════════════════════
// BACKUP / RESTORE
// ═══════════════════════════════════════════════════════════════════
async function exportBackup() {
  const data = await HatziDB.exportAllAsJSON();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hatzi-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('גיבוי הורד', 'success');
}

async function importBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const count = await HatziDB.importFromJSON(data);
    toast(`ייובאו ${count} עבודות`, 'success');
    refreshWorksList();
    closeModals();
  } catch (e) {
    toast('שגיאה בקריאת הקובץ: ' + e.message, 'error');
  }
}

async function confirmClearAll() {
  if (!confirm('למחוק את כל העבודות לגמרי? אין חזרה אחרי זה!')) return;
  if (!confirm('באמת באמת? כל הסרטונים, הפוסטים, והשיחות יימחקו.')) return;
  await HatziDB.clearAllData();
  state.currentWork = null;
  closeModals();
  refreshWorksList();
  toast('הכל נמחק', 'success');
}

// ═══════════════════════════════════════════════════════════════════
// ANALYTICS
// ═══════════════════════════════════════════════════════════════════
async function openAnalytics() {
  // load saved analytics
  const saved = await HatziDB.getAnalyticsData();
  if (saved && saved.items) {
    state.analyticsItems = saved.items;
    renderAnalyticsItems();
  } else {
    state.analyticsItems = [];
    $('analyticsItems').innerHTML = '';
    $('analyzeBtn').style.display = 'none';
    $('analyticsInsight').style.display = 'none';
  }
  openModal('analyticsModal');
}

async function handleAnalyticsCSV(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const items = parseCSV(text);
    if (items.length === 0) {
      toast('לא נמצאו נתונים בקובץ', 'error');
      return;
    }
    state.analyticsItems = items;
    await HatziDB.saveAnalyticsData(items);
    renderAnalyticsItems();
    toast(`נטענו ${items.length} סרטונים`, 'success');
  } catch (e) {
    toast('שגיאה בפענוח CSV: ' + e.message, 'error');
  }
}

function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  // Parse header (flexible mapping)
  const headers = parseCSVRow(lines[0]).map(h => h.toLowerCase().trim());
  const fieldMap = {
    title: ['title', 'name', 'שם', 'כותרת', 'video title', 'post title'],
    views: ['views', 'view count', 'צפיות', 'הצגות'],
    likes: ['likes', 'like count', 'לייקים'],
    comments: ['comments', 'comment count', 'תגובות'],
    shares: ['shares', 'share count', 'שיתופים'],
    completion: ['average watch time', 'completion rate', 'אחוז סיום', 'watch time'],
    content: ['description', 'caption', 'תוכן', 'script', 'תסריט'],
    hook: ['hook', 'פתיח']
  };

  const idx = {};
  Object.keys(fieldMap).forEach(key => {
    idx[key] = -1;
    for (const alias of fieldMap[key]) {
      const i = headers.findIndex(h => h.includes(alias.toLowerCase()));
      if (i >= 0) { idx[key] = i; break; }
    }
  });

  const items = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVRow(lines[i]);
    if (row.length === 0) continue;
    const item = {
      title: idx.title >= 0 ? row[idx.title] : `סרטון ${i}`,
      views: parseInt(idx.views >= 0 ? row[idx.views] : 0) || 0,
      likes: parseInt(idx.likes >= 0 ? row[idx.likes] : 0) || 0,
      comments: parseInt(idx.comments >= 0 ? row[idx.comments] : 0) || 0,
      shares: parseInt(idx.shares >= 0 ? row[idx.shares] : 0) || 0,
      completion: idx.completion >= 0 ? row[idx.completion] : '',
      content: idx.content >= 0 ? row[idx.content] : '',
      hook: idx.hook >= 0 ? row[idx.hook] : ''
    };
    if (item.title) items.push(item);
  }
  return items;
}

function parseCSVRow(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i+1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

function renderAnalyticsItems() {
  const items = state.analyticsItems;
  if (items.length === 0) {
    $('analyticsItems').innerHTML = '';
    $('analyzeBtn').style.display = 'none';
    return;
  }
  // sort by views desc for display
  const sorted = [...items].sort((a, b) => b.views - a.views);
  $('analyticsItems').innerHTML = sorted.slice(0, 20).map(it => `
    <div class="analytics-item">
      <div class="ai-title">${esc(it.title.substring(0, 60))}</div>
      <div class="ai-metric">👁 ${it.views.toLocaleString()}</div>
      <div class="ai-metric">❤ ${it.likes.toLocaleString()}</div>
      <div class="ai-metric">💬 ${it.comments.toLocaleString()}</div>
    </div>
  `).join('');
  $('analyzeBtn').style.display = '';
}

async function runAnalysis() {
  const items = state.analyticsItems;
  if (items.length === 0) { toast('אין נתונים', 'error'); return; }

  $('analyticsInsight').style.display = '';
  $('analyticsInsight').innerHTML = '<div class="loading">מנתח דפוסים...</div>';

  const prompt = PROMPTS.analytics(items);
  const result = await callAPI([{ role: 'user', content: prompt }], 3000, 'analytics');

  if (!result) {
    $('analyticsInsight').innerHTML = '<div style="color:var(--ac)">שגיאה</div>';
    return;
  }

  const html = result
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  $('analyticsInsight').innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════════
// CONTEXT FILES MANAGEMENT
// ═══════════════════════════════════════════════════════════════════
async function openContext() {
  await renderContextList();
  openModal('contextModal');
}

async function renderContextList() {
  const files = await HatziDB.getContextFiles();
  state.contextFiles = files;
  const list = $('contextFilesList');
  const knownFiles = ['canon', 'timeline', 'topics_map', 'own_page_replies', 'reply_strategy', 'style_guide', 'performance_log'];
  const loaded = Object.keys(files).filter(k => k !== 'updatedAt');

  if (loaded.length === 0) {
    list.innerHTML = '<div class="desc" style="padding:12px;text-align:center">אין קבצים טעונים עדיין</div>';
    return;
  }

  list.innerHTML = '<div class="lbl" style="margin:14px 0 8px">קבצים טעונים:</div>' +
    loaded.map(name => {
      const content = files[name] || '';
      const chars = content.length;
      const words = content.split(/\s+/).filter(Boolean).length;
      return `<div class="ctx-file-row">
        <div class="cfr-info">
          <div class="cfr-name">${esc(name)}.md</div>
          <div class="cfr-meta">${chars.toLocaleString()} תווים · ${words.toLocaleString()} מילים</div>
        </div>
        <button onclick="deleteContextFileUI('${esc(name)}')" title="מחק">✕</button>
      </div>`;
    }).join('');
}

async function handleContextUpload(event) {
  const files = Array.from(event.target.files);
  if (files.length === 0) return;
  const existing = await HatziDB.getContextFiles();
  let added = 0;
  for (const file of files) {
    const text = await file.text();
    // Normalize filename: remove .md/.txt extension, use as key
    let name = file.name.replace(/\.(md|txt)$/i, '').replace(/[^a-zA-Z0-9_\u0590-\u05FF]/g, '_');
    existing[name] = text;
    added++;
  }
  existing.updatedAt = Date.now();
  await HatziDB.saveAllContextFiles(existing);
  state.contextFiles = existing;
  await renderContextList();
  event.target.value = ''; // allow re-upload of same files
  toast(`${added} קבצים נטענו`, 'success');
}

async function deleteContextFileUI(name) {
  if (!confirm(`למחוק ${name}?`)) return;
  await HatziDB.deleteContextFile(name);
  state.contextFiles = await HatziDB.getContextFiles();
  await renderContextList();
  toast('נמחק', 'success');
}

async function clearAllContext() {
  if (!confirm('למחוק את כל קבצי הקונטקסט?')) return;
  await HatziDB.setSetting('context_files', {});
  state.contextFiles = {};
  await renderContextList();
  toast('הכל נמחק', 'success');
}

function previewContextBlock() {
  if (typeof buildContextBlock !== 'function') {
    toast('פונקציית בניית קונטקסט לא טעונה', 'error');
    return;
  }
  const block = buildContextBlock(state.contextFiles);
  $('contextPreview').style.display = '';
  $('contextPreviewText').value = block || '(אין קבצים טעונים)';
}

// ═══════════════════════════════════════════════════════════════════
// CANON LINTER
// ═══════════════════════════════════════════════════════════════════
async function runCanonCheck() {
  if (!state.currentWork || state.currentWork.lines.length === 0) {
    toast('אין תוכן לבדוק', 'error');
    return;
  }
  if (Object.keys(state.contextFiles || {}).length === 0) {
    toast('טען קבצי קנון קודם (📚)', 'error');
    return;
  }

  toast('בודק קנון...');
  const fullText = state.currentWork.lines.map(l => l.text).join('\n\n');
  const issues = await runCanonCheckSilent(fullText);
  
  if (issues === null) return; // error already shown
  
  // Show modal with results
  showCanonResults(issues);
}

async function runCanonCheckSilent(textToCheck) {
  const prompt = PROMPTS.canonCheck(textToCheck, state.contextFiles);
  const result = await callAPI([{ role: 'user', content: prompt }], 2500, 'canonCheck');
  if (!result) return null;

  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('no json');
    const data = JSON.parse(jsonMatch[0]);
    if (state.currentWork) {
      state.currentWork.canonCheck = {
        checkedAt: Date.now(),
        overall: data.overall || 'ok',
        issues: data.issues || [],
        newFacts: data.newFacts || []
      };
      await saveCurrentWork('canon_checked');
    }
    return data.issues || [];
  } catch (e) {
    toast('שגיאה בפענוח תוצאות הקנון', 'error');
    return null;
  }
}

function showCanonResults(issues) {
  const data = state.currentWork?.canonCheck || { overall: 'ok', issues, newFacts: [] };
  const body = $('canonResultsBody');
  
  let html = '';
  const bannerClass = data.overall === 'ok' ? 'ok' : data.overall === 'critical' ? 'critical' : 'warnings';
  const bannerText = data.overall === 'ok' ? '✓ הכל נקי — אין סתירות מהקנון' :
                     data.overall === 'critical' ? `⚠ סתירות קריטיות — ${issues.length} בעיות` :
                     `⚠ הערות — ${issues.length} נקודות לבדיקה`;
  html += `<div class="canon-status-banner ${bannerClass}">${bannerText}</div>`;
  
  if (issues.length === 0) {
    html += '<div class="desc">הטקסט תואם את הקנון הנוכחי.</div>';
  } else {
    const typeLabels = {
      contradiction: 'סתירה',
      invention: 'המצאה',
      violation: 'הפרת איסור',
      thread: 'חוט חדש'
    };
    html += issues.map(iss => `
      <div class="canon-issue ${iss.severity || 'medium'}">
        <span class="ci-sev">${iss.severity || 'medium'}</span>
        <span class="ci-type">${typeLabels[iss.type] || iss.type || ''}</span>
        ${iss.quote ? `<div class="ci-quote">"${esc(iss.quote)}"</div>` : ''}
        <div class="ci-problem">${esc(iss.problem || '')}</div>
        ${iss.fix ? `<div class="ci-fix">💡 ${esc(iss.fix)}</div>` : ''}
      </div>
    `).join('');
  }
  
  if (data.newFacts && data.newFacts.length > 0) {
    html += `<div style="margin-top:16px"><div class="lbl">📝 עובדות חדשות (להוסיף לקנון אם מפרסמים):</div>`;
    html += '<ul style="font-size:13px;line-height:1.8;padding-right:20px;color:var(--tx2)">';
    html += data.newFacts.map(f => `<li>${esc(f)}</li>`).join('');
    html += '</ul></div>';
  }
  
  body.innerHTML = html;
  openModal('canonResultsModal');
}

// ═══════════════════════════════════════════════════════════════════
// MOMENTS BANK
// ═══════════════════════════════════════════════════════════════════
async function refreshMomentsList() {
  const moments = await HatziDB.listMoments(state.momentsFilter);
  const list = $('momentsList');
  const empty = $('momentsEmpty');
  
  if (moments.length === 0) {
    list.innerHTML = '';
    empty.style.display = '';
    return;
  }
  
  empty.style.display = 'none';
  list.innerHTML = moments.map(m => {
    const date = new Date(m.createdAt);
    const dateStr = date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
    return `<div class="moment-card ${m.used ? 'used' : ''}">
      ${m.used ? '<div class="used-badge">✓ נוצל</div>' : ''}
      <div class="mc-text">${esc(m.text)}</div>
      <div class="mc-meta">
        <div>
          ${m.category ? `<span class="mc-cat">${esc(m.category)}</span> · ` : ''}
          <span>${dateStr}</span>
        </div>
        <div class="mc-actions">
          ${!m.used ? `<button onclick="openMomentConvert('${m.id}')">+ הפוך לעבודה</button>` : ''}
          <button onclick="editMoment('${m.id}')">✎</button>
          <button class="del-btn" onclick="delMoment('${m.id}')">🗑</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function addMoment() {
  const text = v('momentText');
  const category = v('momentCategory');
  if (!text) { toast('הכנס רגע', 'error'); return; }
  await HatziDB.createMoment(text, category);
  $('momentText').value = '';
  $('momentCategory').value = '';
  await refreshMomentsList();
  toast('רגע נשמר', 'success');
}

function filterMoments(filter, el) {
  state.momentsFilter = filter;
  $$('#momentsFilter .variety-btn').forEach(b => b.classList.remove('on'));
  el.classList.add('on');
  refreshMomentsList();
}

async function delMoment(id) {
  if (!confirm('למחוק את הרגע?')) return;
  await HatziDB.deleteMoment(id);
  await refreshMomentsList();
  toast('נמחק', 'success');
}

async function editMoment(id) {
  const moments = await HatziDB.listMoments('all');
  const m = moments.find(x => x.id === id);
  if (!m) return;
  const newText = prompt('ערוך את הרגע:', m.text);
  if (newText === null) return;
  m.text = newText.trim();
  await HatziDB.updateMoment(m);
  await refreshMomentsList();
  toast('עודכן', 'success');
}

async function openMomentConvert(id) {
  const moments = await HatziDB.listMoments('all');
  const m = moments.find(x => x.id === id);
  if (!m) return;
  state.currentMoment = m;
  $('momentPreview').textContent = m.text;
  $('momentConvertOut').innerHTML = '';
  openModal('momentToWorkModal');
}

async function convertMomentTo(targetMode) {
  const m = state.currentMoment;
  if (!m) return;
  
  $('momentConvertOut').innerHTML = '<div class="loading">ממיר לבריף...</div>';
  
  const prompt = PROMPTS.momentToBrief(m.text, targetMode);
  // Pass targetMode as modeOverride — no more state.mode mutation race condition.
  const result = await callAPI([{ role: 'user', content: prompt }], 1000, 'momentToBrief', targetMode);
  
  if (!result) {
    $('momentConvertOut').innerHTML = '<div style="color:var(--ac)">שגיאה</div>';
    return;
  }
  
  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('no json');
    const brief = JSON.parse(jsonMatch[0]);
    
    // Create work in target mode with brief
    const work = await HatziDB.createWork(targetMode, 'מרגע: ' + m.text.substring(0, 40));
    work.brief = {
      topic: brief.topic || m.text,
      character: brief.character || '',
      emotion: brief.emotion || '',
      avoid: brief.avoid || ''
    };
    if (brief.suggestedAngle) {
      work.angles = [brief.suggestedAngle];
      work.selectedAngle = brief.suggestedAngle;
    }
    await HatziDB.updateWork(work, 'from_moment');
    
    // Mark moment as used
    await HatziDB.markMomentUsed(m.id, work.id);
    
    // Switch to target mode and open
    closeModals();
    applyModeUI(targetMode);
    
    state.currentWork = work;
    HatziDB.clearUndo();
    loadWorkToForm(work);
    switchView('create');
    toast('עבודה נוצרה מהרגע', 'success');
  } catch (e) {
    $('momentConvertOut').innerHTML = '<div style="color:var(--ac)">שגיאה בפענוח: ' + e.message + '</div>';
  }
}

// ═══════════════════════════════════════════════════════════════════
// REPLY MODE — external post replies
// ═══════════════════════════════════════════════════════════════════
async function genReplies() {
  if (!state.currentWork) {
    state.currentWork = await HatziDB.createWork('reply');
  }
  const postText = v('replyPostText');
  const pageName = v('replyPageName');
  const category = v('replyCategory') || 'advisor';
  
  if (!postText) { toast('הדבק את הפוסט החיצוני', 'error'); return; }
  
  $('repliesOut').innerHTML = '<div class="loading">מייצר תגובות...</div>';
  
  const prompt = PROMPTS.reply.generate(postText, pageName, category, state.styleMods.join(', '));
  const result = await callAPI([{ role: 'user', content: prompt }], 3000, 'reply');
  
  if (!result) { $('repliesOut').innerHTML = ''; return; }
  
  // Parse numbered replies
  const replies = result.split(/\n\d+[\.\)]\s*/).map(r => r.trim()).filter(r => r && !/^\d/.test(r));
  // Clean first entry if it's preamble
  const cleanReplies = replies[0] && replies[0].length < 20 ? replies.slice(1) : replies;
  
  if (cleanReplies.length === 0) {
    $('repliesOut').innerHTML = `<div class="out">${fmt(result)}</div>`;
    return;
  }
  
  // Each reply becomes a "line" in the polish view
  state.currentWork.lines = cleanReplies.map(text => ({ text, approved: false }));
  await saveCurrentWork('replies_generated');
  
  $('repliesOut').innerHTML = `<div class="out"><div>${fmt(result)}</div></div>`;
  $('repliesToPol').style.display = '';
}

// ═══════════════════════════════════════════════════════════════════
// CROSS-MODE CONVERSION
// ═══════════════════════════════════════════════════════════════════
async function convertToMode(targetMode) {
  if (!state.currentWork) return;
  const approved = state.currentWork.lines.filter(l => l.approved);
  const sourceText = (approved.length > 0 ? approved : state.currentWork.lines).map(l => l.text).join('\n');
  
  if (!sourceText.trim()) { toast('אין תוכן להמרה', 'error'); return; }
  
  toast('ממיר למדיום אחר...');
  const prompt = PROMPTS.crossMode(state.mode, targetMode, sourceText);
  
  // Pass targetMode as modeOverride — no more state.mode mutation race condition.
  const result = await callAPI([{ role: 'user', content: prompt }], 4000, 'crossMode', targetMode);
  
  if (!result) return;
  
  // Create new work in target mode
  const title = 'המרה: ' + (state.currentWork.title || '').substring(0, 30);
  const newWork = await HatziDB.createWork(targetMode, title);
  newWork.brief = { ...state.currentWork.brief };
  newWork.lines = splitTextToLines(result, targetMode).map(t => ({ text: t, approved: false }));
  newWork.convertedFrom = state.currentWork.id;
  await HatziDB.updateWork(newWork, 'cross_mode_converted');
  
  // Switch to target mode
  applyModeUI(targetMode);
  
  state.currentWork = newWork;
  HatziDB.clearUndo();
  loadWorkToForm(newWork);
  switchView('polish');
  toast(`הומר ל-${targetMode}`, 'success');
}

// ═══════════════════════════════════════════════════════════════════
// PERFORMANCE LOG
// ═══════════════════════════════════════════════════════════════════
async function openPerfEntry(workId) {
  state.currentPerfWorkId = workId;
  const existing = await HatziDB.getPerformance(workId);
  const work = await HatziDB.getWork(workId);
  
  $('perfModalTitle').textContent = '📈 ביצועים: ' + (work?.title || '');
  $('perfPublishedAt').value = existing?.publishedAt ? new Date(existing.publishedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
  $('perfExposure').value = existing?.exposureType || 'organic';
  $('perfSeededGroups').value = (existing?.seededGroups || []).map(g => `${g.name} · ${g.size}`).join('\n');
  $('perfViews').value = existing?.views || '';
  if ($('perfLikes')) $('perfLikes').value = existing?.likes || '';
  $('perfComments').value = existing?.comments || '';
  $('perfShares').value = existing?.shares || '';
  $('perfNewFollowers').value = existing?.newFollowers || '';
  $('perfNotes').value = existing?.notes || '';
  
  togglePerfGroups();
  $('perfExposure').onchange = togglePerfGroups;
  openModal('perfModal');
}

function togglePerfGroups() {
  const show = $('perfExposure').value === 'seeded';
  $('seededGroupsField').style.display = show ? '' : 'none';
}

async function savePerformanceEntry() {
  const workId = state.currentPerfWorkId;
  if (!workId) return;
  
  const seededText = v('perfSeededGroups');
  const seededGroups = seededText ? seededText.split('\n').map(l => {
    const parts = l.split('·').map(p => p.trim());
    return { name: parts[0] || '', size: parts[1] || '' };
  }).filter(g => g.name) : [];
  
  const perf = {
    workId,
    publishedAt: new Date(v('perfPublishedAt')).getTime(),
    exposureType: v('perfExposure'),
    seededGroups,
    views: parseInt(v('perfViews')) || 0,
    likes: parseInt(v('perfLikes')) || 0,
    comments: parseInt(v('perfComments')) || 0,
    shares: parseInt(v('perfShares')) || 0,
    newFollowers: parseInt(v('perfNewFollowers')) || 0,
    notes: v('perfNotes')
  };
  
  await HatziDB.savePerformance(perf);
  closeModals();
  toast('נשמר', 'success');
  // Bug fix: previously called refreshWorksList here, but the user is in the perf flow,
  // not the works flow. Refresh perf list instead so user sees their entry immediately.
  if ($('view-perf') && !$('view-perf').classList.contains('hidden')) {
    renderPerfBulkView();
  } else {
    refreshWorksList();
  }
}

async function openPerfList() {
  await renderPerfList();
  openModal('perfListModal');
}

async function renderPerfList() {
  const perfs = await HatziDB.listAllPerformance();
  const body = $('perfListBody');
  
  if (perfs.length === 0) {
    body.innerHTML = '<div class="desc" style="padding:20px;text-align:center">אין נתוני ביצועים עדיין. לחץ 📈 על עבודה בארכיון כדי להוסיף.</div>';
    return;
  }
  
  // Fetch work titles
  const rows = [];
  for (const p of perfs) {
    const work = await HatziDB.getWork(p.workId);
    if (!work) continue; // orphan, work was deleted
    const date = new Date(p.publishedAt).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
    rows.push(`<div class="perf-row">
      <div class="pr-title">${esc((work.title || '').substring(0, 40))}</div>
      <div class="pr-stat"><strong>${p.views.toLocaleString()}</strong> צפיות</div>
      <div class="pr-stat"><strong>${p.shares.toLocaleString()}</strong> שיתופים</div>
      <div class="pr-stat"><strong>${p.newFollowers.toLocaleString()}</strong> עוקבים</div>
      <span class="pr-exp ${p.exposureType}">${p.exposureType}</span>
      <button onclick="openPerfEntry('${p.workId}')">✎ ערוך</button>
    </div>`);
  }
  
  body.innerHTML = rows.join('');
}

async function analyzePerformance() {
  const perfs = await HatziDB.listAllPerformance();
  if (perfs.length < 3) { toast('צריך לפחות 3 רשומות לניתוח', 'error'); return; }
  
  $('perfInsight').style.display = '';
  $('perfInsight').innerHTML = '<div class="loading">מנתח...</div>';
  
  // Build items in analytics format
  const items = [];
  for (const p of perfs) {
    const work = await HatziDB.getWork(p.workId);
    if (!work) continue;
    items.push({
      title: work.title || '',
      views: p.views,
      likes: p.likes || 0,        // Bug fix: was hardcoded to 0, ignoring real data
      comments: p.comments,
      shares: p.shares,
      completion: '',
      hook: work.selectedHook || '',
      content: work.lines.filter(l => l.approved).map(l => l.text).join('\n').substring(0, 500) + 
               ` [חשיפה: ${p.exposureType}, עוקבים חדשים: ${p.newFollowers}]`
    });
  }
  
  const prompt = PROMPTS.analytics(items);
  const result = await callAPI([{ role: 'user', content: prompt }], 3000, 'perfAnalysis');
  
  if (!result) { $('perfInsight').innerHTML = '<div style="color:var(--ac)">שגיאה</div>'; return; }
  
  const html = result
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  $('perfInsight').innerHTML = html;
}

async function exportPerfCSV() {
  const perfs = await HatziDB.listAllPerformance();
  if (perfs.length === 0) { toast('אין נתונים', 'error'); return; }
  
  const headers = ['title', 'mode', 'publishedAt', 'exposureType', 'views', 'likes', 'comments', 'shares', 'newFollowers', 'notes'];
  const rows = [headers.join(',')];
  for (const p of perfs) {
    const work = await HatziDB.getWork(p.workId);
    if (!work) continue;
    const row = [
      `"${(work.title || '').replace(/"/g,'""')}"`,
      work.mode,
      new Date(p.publishedAt).toISOString().split('T')[0],
      p.exposureType,
      p.views,
      p.likes || 0,
      p.comments,
      p.shares,
      p.newFollowers,
      `"${(p.notes || '').replace(/"/g,'""')}"`
    ];
    rows.push(row.join(','));
  }
  const blob = new Blob(['\ufeff' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hatzi-performance-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('CSV הורד', 'success');
}

// ═══════════════════════════════════════════════════════════════════
// PERFORMANCE V2 — bulk entry, paste import, feedback loop
// ═══════════════════════════════════════════════════════════════════

// Open the new performance view (replaces the modal-only flow).
async function openPerfBulkView() {
  switchView('perf');
  await renderPerfBulkView();
}

// Render the bulk entry table — works without perf data, ready to fill inline.
async function renderPerfBulkView() {
  // Get all works across all modes
  const allModes = ['video', 'post', 'whatsapp', 'reply'];
  const allWorks = [];
  for (const mode of allModes) {
    const ws = await HatziDB.listWorks(mode);
    allWorks.push(...ws);
  }

  const allPerfs = await HatziDB.listAllPerformance();
  const perfMap = new Map(allPerfs.map(p => [p.workId, p]));

  // Show only works that have approved content (drafts not ready yet aren't worth tracking)
  const eligible = allWorks.filter(w => 
    w.lines && w.lines.some(l => l.approved)
  );

  // Split: pending (no perf yet) vs logged (have perf)
  const pending = eligible.filter(w => !perfMap.has(w.id));
  const logged = eligible.filter(w => perfMap.has(w.id));

  // Sort pending by createdAt desc — newest first (most likely to track)
  pending.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  // Sort logged by publishedAt desc
  logged.sort((a, b) => {
    const pa = perfMap.get(a.id);
    const pb = perfMap.get(b.id);
    return (pb.publishedAt || 0) - (pa.publishedAt || 0);
  });

  // Render pending table (the bulk entry one)
  const pendingEl = $('perfPendingTable');
  if (pending.length === 0) {
    pendingEl.innerHTML = '<div class="desc" style="text-align:center;padding:20px">אין סרטונים לרשום. תחזור אחרי שתפרסם משהו.</div>';
    $('perfBulkSaveBar').style.display = 'none';
  } else {
    const todayStr = new Date().toISOString().split('T')[0];
    const headerRow = `
      <div class="pb-row pb-header">
        <div class="pb-title">כותרת</div>
        <div class="pb-mode">סוג</div>
        <div class="pb-date">תאריך</div>
        <div class="pb-num">צפיות</div>
        <div class="pb-num">לייקים</div>
        <div class="pb-num">תגובות</div>
        <div class="pb-num">שיתופים</div>
        <div class="pb-num">עוקבים+</div>
        <div class="pb-action"></div>
      </div>`;
    const rows = pending.map(w => {
      const modeLabel = { video: '🎬', post: '📝', whatsapp: '💬', reply: '💭' }[w.mode] || w.mode;
      // Each row: title (read-only), mode, date input, then 5 number inputs
      return `
        <div class="pb-row" data-wid="${esc(w.id)}">
          <div class="pb-title" title="${esc(w.title || '')}">${esc((w.title || '(ללא שם)').substring(0, 40))}</div>
          <div class="pb-mode">${modeLabel}</div>
          <div class="pb-date"><input type="date" class="pb-inp" data-f="publishedAt" value="${todayStr}"></div>
          <div class="pb-num"><input type="number" class="pb-inp" data-f="views" placeholder="0" min="0"></div>
          <div class="pb-num"><input type="number" class="pb-inp" data-f="likes" placeholder="0" min="0"></div>
          <div class="pb-num"><input type="number" class="pb-inp" data-f="comments" placeholder="0" min="0"></div>
          <div class="pb-num"><input type="number" class="pb-inp" data-f="shares" placeholder="0" min="0"></div>
          <div class="pb-num"><input type="number" class="pb-inp" data-f="newFollowers" placeholder="0" min="0"></div>
          <div class="pb-action"><button class="btn2 bsm" onclick="openPerfEntry('${esc(w.id)}')" title="טופס מלא">⚙</button></div>
        </div>`;
    }).join('');
    pendingEl.innerHTML = headerRow + rows;
    $('perfBulkSaveBar').style.display = '';
    updateBulkUnsavedCount();
  }

  // Wire up input listeners to track filled rows
  pendingEl.querySelectorAll('.pb-inp').forEach(inp => {
    inp.addEventListener('input', updateBulkUnsavedCount);
  });

  // Render logged table
  const loggedEl = $('perfLoggedTable');
  if (logged.length === 0) {
    loggedEl.innerHTML = '<div class="desc">אין רשומות עדיין</div>';
  } else {
    const rows = logged.map(w => {
      const p = perfMap.get(w.id);
      const date = new Date(p.publishedAt).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
      const eng = p.views > 0 ? Math.round((((p.likes||0) + p.comments + p.shares) / p.views) * 1000) / 10 : 0;
      return `
        <div class="pl-row">
          <div class="pl-date">${date}</div>
          <div class="pl-title" title="${esc(w.title || '')}">${esc((w.title || '').substring(0, 35))}</div>
          <div class="pl-stat"><strong>${(p.views||0).toLocaleString()}</strong></div>
          <div class="pl-stat">❤ ${(p.likes||0).toLocaleString()}</div>
          <div class="pl-stat">💬 ${(p.comments||0).toLocaleString()}</div>
          <div class="pl-stat">↗ ${(p.shares||0).toLocaleString()}</div>
          <div class="pl-stat" title="engagement rate">${eng}%</div>
          <button class="btn2 bsm" onclick="openPerfEntry('${esc(w.id)}')">✎</button>
        </div>`;
    }).join('');
    loggedEl.innerHTML = rows;
  }

  // Render insights if we have a saved analysis
  await renderSavedInsights();
}

function updateBulkUnsavedCount() {
  const rows = document.querySelectorAll('#perfPendingTable .pb-row[data-wid]');
  let filled = 0;
  rows.forEach(row => {
    const views = row.querySelector('input[data-f="views"]')?.value;
    if (views && parseInt(views) > 0) filled++;
  });
  const lbl = $('perfBulkUnsaved');
  if (lbl) lbl.textContent = filled === 0 ? 'אין שורות חדשות' : `${filled} שורות חדשות לשמירה`;
}

// Save all rows in the bulk table that have at least views filled.
async function savePerfBulk() {
  const rows = document.querySelectorAll('#perfPendingTable .pb-row[data-wid]');
  let saved = 0;
  for (const row of rows) {
    const wid = row.dataset.wid;
    const views = parseInt(row.querySelector('input[data-f="views"]')?.value) || 0;
    if (views <= 0) continue;  // skip empty rows
    
    const perf = {
      workId: wid,
      publishedAt: new Date(row.querySelector('input[data-f="publishedAt"]')?.value || Date.now()).getTime(),
      exposureType: 'organic',  // default for bulk; user can edit later via ⚙
      seededGroups: [],
      views,
      likes: parseInt(row.querySelector('input[data-f="likes"]')?.value) || 0,
      comments: parseInt(row.querySelector('input[data-f="comments"]')?.value) || 0,
      shares: parseInt(row.querySelector('input[data-f="shares"]')?.value) || 0,
      newFollowers: parseInt(row.querySelector('input[data-f="newFollowers"]')?.value) || 0,
      notes: ''
    };
    await HatziDB.savePerformance(perf);
    saved++;
  }
  if (saved === 0) {
    toast('אין שורות עם צפיות למלא', 'error');
    return;
  }
  toast(`${saved} סרטונים נשמרו`, 'success');
  await renderPerfBulkView();
}

// Paste-import: parse tab/comma-separated text, match by title to existing works.
function openPasteImportPerf() {
  $('perfPasteText').value = '';
  openModal('perfPasteModal');
}

async function confirmPasteImportPerf() {
  const text = $('perfPasteText').value.trim();
  if (!text) { toast('אין טקסט', 'error'); return; }

  // Get all works for matching
  const allModes = ['video', 'post', 'whatsapp', 'reply'];
  const allWorks = [];
  for (const mode of allModes) {
    const ws = await HatziDB.listWorks(mode);
    allWorks.push(...ws);
  }

  // Parse lines: title \t views \t likes \t comments \t shares
  // Also accept commas as separator. Skip header rows.
  const lines = text.split('\n').filter(l => l.trim());
  const matched = [];
  const unmatched = [];

  for (const line of lines) {
    const parts = line.split(/\t|,/).map(p => p.trim());
    if (parts.length < 2) continue;
    const title = parts[0];
    // Skip likely header
    if (/^(title|כותרת|name|שם)/i.test(title)) continue;

    // Find best matching work by title (case-insensitive substring match)
    const titleLow = title.toLowerCase();
    const work = allWorks.find(w => 
      (w.title || '').toLowerCase().includes(titleLow) || 
      titleLow.includes((w.title || '').toLowerCase().substring(0, 15))
    );

    if (!work) { unmatched.push(title); continue; }

    matched.push({
      workId: work.id,
      publishedAt: Date.now(),
      exposureType: 'organic',
      seededGroups: [],
      views: parseInt(parts[1]) || 0,
      likes: parseInt(parts[2]) || 0,
      comments: parseInt(parts[3]) || 0,
      shares: parseInt(parts[4]) || 0,
      newFollowers: parseInt(parts[5]) || 0,
      notes: ''
    });
  }

  if (matched.length === 0) {
    toast('לא נמצאה התאמה לאף שורה — בדוק את הכותרות', 'error');
    return;
  }

  for (const perf of matched) {
    await HatziDB.savePerformance(perf);
  }

  closeModals();
  let msg = `${matched.length} סרטונים נוספו`;
  if (unmatched.length > 0) msg += ` (${unmatched.length} כותרות לא נמצאו)`;
  toast(msg, 'success');
  await renderPerfBulkView();
}

// Run analysis + extract top performers + save the bank.
// This is the feedback loop: top perform → injected as YES BANK in future calls.
async function runFullAnalysis() {
  const perfs = await HatziDB.listAllPerformance();
  if (perfs.length < 3) { toast('צריך לפחות 3 סרטונים עם נתונים', 'error'); return; }

  toast('מנתח דפוסים...');
  $('perfInsightsSec').style.display = '';
  $('perfInsightsBody').innerHTML = '<div class="loading">מנתח דפוסים על בסיס ' + perfs.length + ' סרטונים...</div>';

  // Build analytics items + identify top performers (by viral coefficient = (likes+comments+shares)/views)
  const items = [];
  const scored = [];
  for (const p of perfs) {
    const work = await HatziDB.getWork(p.workId);
    if (!work) continue;
    const eng = (p.views > 0) ? ((p.likes||0) + p.comments + p.shares) / p.views : 0;
    const approvedText = work.lines.filter(l => l.approved).map(l => l.text).join('\n');
    items.push({
      title: work.title || '',
      views: p.views,
      likes: p.likes || 0,
      comments: p.comments,
      shares: p.shares,
      completion: '',
      hook: work.selectedHook || '',
      content: approvedText.substring(0, 500) + ` [חשיפה: ${p.exposureType}, עוקבים+: ${p.newFollowers}]`
    });
    scored.push({ workId: p.workId, title: work.title || '', mode: work.mode, views: p.views, eng, content: approvedText });
  }

  // Run the analysis prompt
  const prompt = PROMPTS.analytics(items);
  const result = await callAPI([{ role: 'user', content: prompt }], 3000, 'perfAnalysis');
  if (!result) { $('perfInsightsBody').innerHTML = '<div style="color:var(--ac)">שגיאה בניתוח</div>'; return; }

  // Build top performers bank — top 3 by engagement, or by views if eng is 0 across the board.
  const sorted = scored.filter(s => s.views > 0).sort((a, b) => {
    if (b.eng !== a.eng) return b.eng - a.eng;
    return b.views - a.views;
  });
  const topBank = sorted.slice(0, 3).map(s => ({
    workId: s.workId,
    title: s.title,
    mode: s.mode,
    views: s.views,
    engRate: Math.round(s.eng * 1000) / 10,
    snippet: s.content.substring(0, 300)
  }));

  // Save bank + insights to settings for reuse
  await HatziDB.setSetting('topPerformersBank', topBank);
  await HatziDB.setSetting('lastInsights', { generatedAt: Date.now(), text: result, basedOn: perfs.length });

  // Render
  const html = result
    .replace(/^## (.+)$/gm, '<h3 style="margin-top:16px;font-size:14px;color:var(--ac)">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
  $('perfInsightsBody').innerHTML = html;
  renderTopBank(topBank);
  toast(`ניתוח הושלם. ${topBank.length} סרטונים מובילים נוספו ל-bank`, 'success');
}

function renderTopBank(bank) {
  const el = $('perfTopBank');
  if (!el) return;
  if (!bank || bank.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div style="margin-top:14px;padding:12px;background:var(--bg2);border-radius:8px;border:1px solid var(--gr)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <strong style="color:var(--gr)">⭐ סרטונים שיוזרקו ל-prompts הבאים (${bank.length})</strong>
        <label style="font-size:12px">
          <input type="checkbox" id="useFeedbackLoop" ${state.useFeedbackLoop ? 'checked' : ''} onchange="toggleFeedbackLoop(this.checked)">
          הפעל לולאת למידה
        </label>
      </div>
      <div style="font-size:12px;color:var(--tx3);margin-bottom:8px">
        אלה ה-3 הסרטונים שעבדו הכי טוב. כשתייצר תסריט חדש, הקטעים האלה יוזרקו כ-YES BANK כדי שהמודל ילמד מהמה שכבר עבד.
      </div>
      ${bank.map((b, i) => `
        <div style="padding:8px;border-top:1px solid var(--bg3);font-size:12px">
          <strong>${i+1}. ${esc(b.title)}</strong> · ${b.views.toLocaleString()} צפיות · ${b.engRate}% engagement<br>
          <span style="color:var(--tx3)">${esc(b.snippet.substring(0, 150))}...</span>
        </div>
      `).join('')}
    </div>`;
}

async function toggleFeedbackLoop(enabled) {
  state.useFeedbackLoop = enabled;
  await HatziDB.setSetting('useFeedbackLoop', enabled);
  toast(enabled ? 'לולאת למידה מופעלת' : 'לולאת למידה מבוטלת', 'success');
}

// Render previously saved insights (called when opening the perf view).
async function renderSavedInsights() {
  const insights = await HatziDB.getSetting('lastInsights');
  const bank = await HatziDB.getSetting('topPerformersBank');
  if (!insights && !bank) {
    $('perfInsightsSec').style.display = 'none';
    return;
  }
  $('perfInsightsSec').style.display = '';
  if (insights) {
    const ageDays = Math.floor((Date.now() - insights.generatedAt) / (1000*60*60*24));
    const ageStr = ageDays === 0 ? 'היום' : ageDays === 1 ? 'אתמול' : `לפני ${ageDays} ימים`;
    const html = insights.text
      .replace(/^## (.+)$/gm, '<h3 style="margin-top:16px;font-size:14px;color:var(--ac)">$1</h3>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
    $('perfInsightsBody').innerHTML = `<div class="desc" style="margin-bottom:8px">${ageStr} · ${insights.basedOn} סרטונים</div>` + html;
  }
  if (bank) renderTopBank(bank);
}

// Get the top-performers bank for prompt injection.
// Returns a string ready to append to the system prompt, or empty string if disabled/empty.
async function getFeedbackBlock() {
  if (!state.useFeedbackLoop) return '';
  const bank = await HatziDB.getSetting('topPerformersBank');
  if (!bank || bank.length === 0) return '';
  
  const lines = ['═══ סרטונים שעבדו הכי טוב (לקח מהביצועים האמיתיים) ═══'];
  lines.push('(אלה הסרטונים שלך שקיבלו הכי הרבה engagement. תלמד מהמבנה והדימויים שלהם, אל תעתיק.)');
  lines.push('');
  bank.forEach((b, i) => {
    lines.push(`--- ${i+1}. "${b.title}" (${b.views.toLocaleString()} צפיות, ${b.engRate}% engagement) ---`);
    lines.push(b.snippet);
    lines.push('');
  });
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════
// BREAKOUT MODE — חומר גלם, בלי קנון
// ═══════════════════════════════════════════════════════════════════
function selectHeat(heat, el) {
  state.breakoutHeat = heat;
  $$('#heatRow .heat-btn').forEach(b => b.classList.remove('on'));
  el.classList.add('on');
}

async function genBreakoutIdeas(append = false) {
  const seed = v('breakoutSeed');
  const tags = state.breakoutTags.join(', ');
  
  toast('מייצר רעיונות...');
  const prompt = PROMPTS.breakout.ideas(state.breakoutHeat, seed, tags);
  const result = await callAPI([{ role: 'user', content: prompt }], 3000, 'breakoutIdeas');
  
  if (!result) return;
  
  // Parse numbered list
  const lines = result.split('\n')
    .map(l => l.trim())
    .filter(l => /^\d+[\.\)]/.test(l))
    .map(l => l.replace(/^\d+[\.\)]\s*/, '').trim())
    .filter(l => l.length > 0);
  
  if (lines.length === 0) {
    toast('לא הצלחתי לפרסר את התשובה', 'error');
    return;
  }
  
  const newIdeas = lines.map(text => ({
    id: 'bi_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5),
    text,
    heat: state.breakoutHeat,
    expanded: null,
    saved: false,
    savedMomentId: null
  }));
  
  if (append) {
    state.breakoutIdeas = [...newIdeas, ...state.breakoutIdeas];
  } else {
    state.breakoutIdeas = newIdeas;
  }
  
  renderBreakoutIdeas();
  toast(`${newIdeas.length} רעיונות נוצרו`, 'success');
}

function renderBreakoutIdeas() {
  const container = $('breakoutIdeasList');
  const wrapper = $('breakoutResults');
  if (!container || !wrapper) return;
  
  if (state.breakoutIdeas.length === 0) {
    wrapper.style.display = 'none';
    return;
  }
  
  wrapper.style.display = '';
  
  container.innerHTML = state.breakoutIdeas.map((idea, i) => `
    <div class="idea-row ${idea.saved ? 'saved' : ''}" data-id="${idea.id}">
      <div class="idea-num">${i + 1}</div>
      <div class="idea-text">
        ${esc(idea.text)}
        ${idea.expanded ? `<div class="idea-expanded">${esc(idea.expanded)}</div>` : ''}
      </div>
      <div class="idea-actions">
        ${!idea.expanded ? `<button onclick="expandIdea('${idea.id}')">🔍 הרחב</button>` : ''}
        <button class="save-btn" onclick="saveIdeaAsMoment('${idea.id}')" ${idea.saved ? 'disabled' : ''}>${idea.saved ? '✓ נשמר' : '← רגע'}</button>
        <button onclick="discardIdea('${idea.id}')">✕</button>
      </div>
    </div>
  `).join('');
}

async function expandIdea(id) {
  const idea = state.breakoutIdeas.find(i => i.id === id);
  if (!idea) return;
  
  toast('מרחיב...');
  const prompt = PROMPTS.breakout.expand(idea.text);
  const result = await callAPI([{ role: 'user', content: prompt }], 400, 'breakoutExpand');
  if (!result) return;
  
  idea.expanded = result.trim().replace(/^["'«»]+|["'«»]+$/g, '');
  renderBreakoutIdeas();
}

async function saveIdeaAsMoment(id) {
  const idea = state.breakoutIdeas.find(i => i.id === id);
  if (!idea || idea.saved) return;
  
  // If expanded, use both. Otherwise just the idea.
  const text = idea.expanded ? `${idea.text}\n\n${idea.expanded}` : idea.text;
  const category = `פריצה 🌶️${'🌶️'.repeat(idea.heat - 1)}`;
  
  const moment = await HatziDB.createMoment(text, category);
  idea.saved = true;
  idea.savedMomentId = moment.id;
  renderBreakoutIdeas();
  toast('נשמר לבנק הרגעים', 'success');
}

function discardIdea(id) {
  state.breakoutIdeas = state.breakoutIdeas.filter(i => i.id !== id);
  renderBreakoutIdeas();
}

// ═══════════════════════════════════════════════════════════════════
// WILD ANGLES — "מחוץ לקופסה" בתוך מצבים רגילים
// ═══════════════════════════════════════════════════════════════════
async function genWildAngles() {
  if (!state.currentWork) {
    state.currentWork = await HatziDB.createWork(state.mode);
  }

  const brief = {
    topic: v('topic'),
    character: v('chr'),
    emotion: v('emo')
  };

  // For wild angles, topic is optional — can do pure wild brainstorm
  $('anglesOut').innerHTML = '<div class="loading">מחולל זוויות מחוץ לקופסה...</div>';
  const prompt = PROMPTS.wildAngles(brief, state.mode);
  const result = await callAPI([{ role: 'user', content: prompt }], 2000, 'wildAngles');

  if (!result) { $('anglesOut').innerHTML = ''; return; }

  const angles = result.split('\n').filter(l => /^\d[\.\)]/.test(l.trim())).map(l => l.replace(/^\d[\.\)]\s*/, '').trim());
  
  // Append to existing angles (don't overwrite)
  const existing = state.currentWork.angles || [];
  state.currentWork.angles = [...existing, ...angles];
  await saveCurrentWork('wild_angles_generated');
  
  // Render with a distinctive header
  const combinedText = result;
  const wildLabel = `<div style="font-size:11px;color:var(--br);margin-bottom:6px;font-weight:700">🎲 מחוץ לקופסה — בלי קנון:</div>`;
  $('anglesOut').innerHTML = `<div class="out" style="border-color:var(--br)">${wildLabel}<div>${fmt(combinedText)}</div></div>`;
  
  // Wire up the picker for wild angles
  const picker = $('anglesPicker');
  picker.style.display = '';
  picker.innerHTML = '<div style="font-size:11px;color:var(--tx2);margin-bottom:6px">👇 בחר זווית מחוץ לקופסה:</div>';
  angles.forEach((line) => {
    const clean = line.replace(/^\d[\.\)]\s*/, '').trim();
    const div = document.createElement('div');
    div.className = 'angle-sel';
    div.innerHTML = `<div class="check"></div><div style="flex:1">${esc(clean)}</div>`;
    div.onclick = () => pickAngle(clean, div);
    picker.appendChild(div);
  });
}
