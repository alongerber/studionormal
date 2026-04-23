// ═══════════════════════════════════════════════════════════════════
// חצינורמלי — STORAGE LAYER
// IndexedDB + versioning + undo/redo + JSON backup
// ═══════════════════════════════════════════════════════════════════

const DB_NAME = 'hatziStudio';
const DB_VERSION = 2;
const STORE_WORKS = 'works';           // all works (video/post/whatsapp/reply)
const STORE_VERSIONS = 'versions';     // version snapshots
const STORE_SETTINGS = 'settings';     // API key, preferences, analytics, canon files
const STORE_MOMENTS = 'moments';       // raw moments bank
const STORE_PERF = 'performance';      // performance tracking per work

let db = null;

// ═══════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════
function openDB() {
  return new Promise((resolve, reject) => {
    if (db) { resolve(db); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains(STORE_WORKS)) {
        const works = d.createObjectStore(STORE_WORKS, { keyPath: 'id' });
        works.createIndex('mode', 'mode', { unique: false });
        works.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
      if (!d.objectStoreNames.contains(STORE_VERSIONS)) {
        const versions = d.createObjectStore(STORE_VERSIONS, { keyPath: 'id', autoIncrement: true });
        versions.createIndex('workId', 'workId', { unique: false });
        versions.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!d.objectStoreNames.contains(STORE_SETTINGS)) {
        d.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }
      // v2 additions
      if (!d.objectStoreNames.contains(STORE_MOMENTS)) {
        const moments = d.createObjectStore(STORE_MOMENTS, { keyPath: 'id' });
        moments.createIndex('createdAt', 'createdAt', { unique: false });
        moments.createIndex('used', 'used', { unique: false });
      }
      if (!d.objectStoreNames.contains(STORE_PERF)) {
        const perf = d.createObjectStore(STORE_PERF, { keyPath: 'workId' });
        perf.createIndex('publishedAt', 'publishedAt', { unique: false });
      }
    };
  });
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════
function tx(storeName, mode = 'readonly') {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function uuid() {
  return 'w_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
}

// ═══════════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════════
async function getSetting(key) {
  await openDB();
  const result = await promisify(tx(STORE_SETTINGS).get(key));
  return result ? result.value : null;
}

async function setSetting(key, value) {
  await openDB();
  return promisify(tx(STORE_SETTINGS, 'readwrite').put({ key, value }));
}

// ═══════════════════════════════════════════════════════════════════
// WORKS (CRUD)
// ═══════════════════════════════════════════════════════════════════
/**
 * Work schema:
 * {
 *   id: string,
 *   mode: 'video' | 'post' | 'whatsapp',
 *   title: string,
 *   brief: { topic, character, emotion, avoid },
 *   selectedAngle: string,
 *   angles: string[],
 *   hooks: string[],       // only video
 *   selectedHook: string,  // only video
 *   lines: [{ text, approved, score?, scoreReason? }],
 *   callbacks: [{ lineA, lineB, type, note }],
 *   analytics: { views, likes, ... } | null,
 *   createdAt: number,
 *   updatedAt: number
 * }
 */

async function createWork(mode, title = 'עבודה חדשה') {
  await openDB();
  const now = Date.now();
  const work = {
    id: uuid(),
    mode,
    title,
    brief: { topic: '', character: '', emotion: '', avoid: '' },
    selectedAngle: '',
    angles: [],
    hooks: [],
    selectedHook: '',
    lines: [],
    callbacks: [],
    analytics: null,
    createdAt: now,
    updatedAt: now
  };
  await promisify(tx(STORE_WORKS, 'readwrite').put(work));
  await saveVersion(work.id, work, 'created');
  return work;
}

async function getWork(id) {
  await openDB();
  return promisify(tx(STORE_WORKS).get(id));
}

async function updateWork(work, reason = 'edit') {
  await openDB();
  work.updatedAt = Date.now();
  await promisify(tx(STORE_WORKS, 'readwrite').put(work));
  // save version only on meaningful changes (throttled)
  if (shouldSaveVersion(work.id, reason)) {
    await saveVersion(work.id, work, reason);
  }
  return work;
}

async function deleteWork(id) {
  await openDB();
  await promisify(tx(STORE_WORKS, 'readwrite').delete(id));
  // also delete its versions
  const versionStore = tx(STORE_VERSIONS, 'readwrite');
  const idx = versionStore.index('workId');
  const req = idx.openCursor(IDBKeyRange.only(id));
  return new Promise((resolve) => {
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
  });
}

async function listWorks(mode = null) {
  await openDB();
  const store = tx(STORE_WORKS);
  const all = await promisify(store.getAll());
  const filtered = mode ? all.filter(w => w.mode === mode) : all;
  return filtered.sort((a, b) => b.updatedAt - a.updatedAt);
}

// ═══════════════════════════════════════════════════════════════════
// VERSIONING (undo/redo)
// ═══════════════════════════════════════════════════════════════════
const lastVersionTime = {}; // throttle: max 1 version per 3 seconds per work

function shouldSaveVersion(workId, reason) {
  // always save on these reasons
  if (['created', 'draft_generated', 'angle_selected', 'hook_selected', 'line_approved', 'line_deleted', 'bulk_approve', 'bulk_delete', 'reset_approvals', 'imported'].includes(reason)) {
    return true;
  }
  // throttle others
  const now = Date.now();
  const last = lastVersionTime[workId] || 0;
  if (now - last < 3000) return false;
  lastVersionTime[workId] = now;
  return true;
}

async function saveVersion(workId, workSnapshot, reason) {
  await openDB();
  const version = {
    workId,
    timestamp: Date.now(),
    reason,
    snapshot: JSON.parse(JSON.stringify(workSnapshot))
  };
  await promisify(tx(STORE_VERSIONS, 'readwrite').add(version));
  // cleanup: keep last 30 versions per work
  await cleanupVersions(workId);
}

async function cleanupVersions(workId, keep = 30) {
  const store = tx(STORE_VERSIONS, 'readwrite');
  const idx = store.index('workId');
  const all = await promisify(idx.getAll(IDBKeyRange.only(workId)));
  if (all.length <= keep) return;
  all.sort((a, b) => a.timestamp - b.timestamp);
  const toDelete = all.slice(0, all.length - keep);
  for (const v of toDelete) {
    await promisify(store.delete(v.id));
  }
}

async function listVersions(workId) {
  await openDB();
  const store = tx(STORE_VERSIONS);
  const idx = store.index('workId');
  const all = await promisify(idx.getAll(IDBKeyRange.only(workId)));
  return all.sort((a, b) => b.timestamp - a.timestamp);
}

async function restoreVersion(versionId) {
  await openDB();
  const version = await promisify(tx(STORE_VERSIONS).get(versionId));
  if (!version) return null;
  const work = version.snapshot;
  work.updatedAt = Date.now();
  await promisify(tx(STORE_WORKS, 'readwrite').put(work));
  await saveVersion(work.id, work, 'restored');
  return work;
}

// ═══════════════════════════════════════════════════════════════════
// IN-MEMORY UNDO/REDO STACK (for current session)
// ═══════════════════════════════════════════════════════════════════
const undoStack = [];
const redoStack = [];
const MAX_UNDO = 50;

function pushUndo(workSnapshot) {
  undoStack.push(JSON.parse(JSON.stringify(workSnapshot)));
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0; // clear redo on new action
}

function popUndo(currentWork) {
  if (undoStack.length === 0) return null;
  redoStack.push(JSON.parse(JSON.stringify(currentWork)));
  return undoStack.pop();
}

function popRedo(currentWork) {
  if (redoStack.length === 0) return null;
  undoStack.push(JSON.parse(JSON.stringify(currentWork)));
  return redoStack.pop();
}

function canUndo() { return undoStack.length > 0; }
function canRedo() { return redoStack.length > 0; }
function clearUndo() { undoStack.length = 0; redoStack.length = 0; }

// ═══════════════════════════════════════════════════════════════════
// BACKUP / RESTORE (JSON export)
// ═══════════════════════════════════════════════════════════════════
async function exportAllAsJSON() {
  await openDB();
  const works = await promisify(tx(STORE_WORKS).getAll());
  const settings = await promisify(tx(STORE_SETTINGS).getAll());
  const moments = await promisify(tx(STORE_MOMENTS).getAll());
  const performance = await promisify(tx(STORE_PERF).getAll());
  return {
    version: 2,
    exportedAt: Date.now(),
    works,
    moments,
    performance,
    settings: settings.filter(s => s.key !== 'apiKey') // never export API key
  };
}

async function importFromJSON(data) {
  await openDB();
  if (!data.works || !Array.isArray(data.works)) throw new Error('Invalid JSON format');
  for (const work of data.works) {
    // regenerate ID to avoid conflicts
    work.id = uuid();
    work.updatedAt = Date.now();
    await promisify(tx(STORE_WORKS, 'readwrite').put(work));
  }
  // import moments if present
  if (data.moments && Array.isArray(data.moments)) {
    for (const m of data.moments) {
      m.id = momentUuid();
      await promisify(tx(STORE_MOMENTS, 'readwrite').put(m));
    }
  }
  // import context files if in settings
  if (data.settings && Array.isArray(data.settings)) {
    for (const s of data.settings) {
      if (s.key === 'context_files') {
        await promisify(tx(STORE_SETTINGS, 'readwrite').put(s));
      }
    }
  }
  return data.works.length;
}

async function clearAllData() {
  await openDB();
  await promisify(tx(STORE_WORKS, 'readwrite').clear());
  await promisify(tx(STORE_VERSIONS, 'readwrite').clear());
  // preserve settings (API key, etc.)
}

// ═══════════════════════════════════════════════════════════════════
// ANALYTICS STORAGE (TikTok performance data)
// ═══════════════════════════════════════════════════════════════════
async function saveAnalyticsData(items) {
  return setSetting('tiktok_analytics', { items, importedAt: Date.now() });
}

async function getAnalyticsData() {
  return getSetting('tiktok_analytics');
}

// ═══════════════════════════════════════════════════════════════════
// CONTEXT FILES (canon, timeline, topics_map, etc.)
// ═══════════════════════════════════════════════════════════════════
/**
 * Context files schema in settings:
 * { key: 'context_files', value: { canon: "...", timeline: "...", topics_map: "...",
 *                                  reply_strategy: "...", own_page_replies: "...",
 *                                  updatedAt: 1234 } }
 */
async function getContextFiles() {
  const data = await getSetting('context_files');
  return data || {};
}

async function saveContextFile(name, content) {
  const existing = await getContextFiles();
  existing[name] = content;
  existing.updatedAt = Date.now();
  return setSetting('context_files', existing);
}

async function saveAllContextFiles(files) {
  const updated = { ...files, updatedAt: Date.now() };
  return setSetting('context_files', updated);
}

async function deleteContextFile(name) {
  const existing = await getContextFiles();
  delete existing[name];
  existing.updatedAt = Date.now();
  return setSetting('context_files', existing);
}

// ═══════════════════════════════════════════════════════════════════
// MOMENTS BANK
// ═══════════════════════════════════════════════════════════════════
/**
 * Moment schema:
 * { id, text, category, createdAt, used, usedInWorkId? }
 */
function momentUuid() {
  return 'm_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
}

async function createMoment(text, category = '') {
  await openDB();
  const m = {
    id: momentUuid(),
    text: text.trim(),
    category,
    createdAt: Date.now(),
    used: false,
    usedInWorkId: null
  };
  await promisify(tx(STORE_MOMENTS, 'readwrite').put(m));
  return m;
}

async function listMoments(filter = 'all') {
  await openDB();
  const all = await promisify(tx(STORE_MOMENTS).getAll());
  let filtered = all;
  if (filter === 'unused') filtered = all.filter(m => !m.used);
  else if (filter === 'used') filtered = all.filter(m => m.used);
  return filtered.sort((a, b) => b.createdAt - a.createdAt);
}

async function updateMoment(m) {
  await openDB();
  return promisify(tx(STORE_MOMENTS, 'readwrite').put(m));
}

async function deleteMoment(id) {
  await openDB();
  return promisify(tx(STORE_MOMENTS, 'readwrite').delete(id));
}

async function markMomentUsed(id, workId) {
  const m = await promisify(tx(STORE_MOMENTS).get(id));
  if (!m) return null;
  m.used = true;
  m.usedInWorkId = workId;
  return updateMoment(m);
}

// ═══════════════════════════════════════════════════════════════════
// PERFORMANCE LOG
// ═══════════════════════════════════════════════════════════════════
/**
 * Performance schema:
 * { workId, publishedAt, exposureType: 'organic'|'seeded'|'viral',
 *   seededGroups: [{name, size}], views, comments, shares, newFollowers,
 *   notes, lastUpdated, remindAt }
 */
async function getPerformance(workId) {
  await openDB();
  return promisify(tx(STORE_PERF).get(workId));
}

async function savePerformance(perf) {
  await openDB();
  perf.lastUpdated = Date.now();
  return promisify(tx(STORE_PERF, 'readwrite').put(perf));
}

async function listAllPerformance() {
  await openDB();
  const all = await promisify(tx(STORE_PERF).getAll());
  return all.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
}

async function deletePerformance(workId) {
  await openDB();
  return promisify(tx(STORE_PERF, 'readwrite').delete(workId));
}

// ═══════════════════════════════════════════════════════════════════
// LAST WORK PER MODE (memory across mode switches)
// ═══════════════════════════════════════════════════════════════════
async function getLastWorkId(mode) {
  return getSetting('lastWork_' + mode);
}

async function setLastWorkId(mode, id) {
  return setSetting('lastWork_' + mode, id);
}

// expose globally
window.HatziDB = {
  openDB,
  getSetting, setSetting,
  createWork, getWork, updateWork, deleteWork, listWorks,
  listVersions, restoreVersion,
  pushUndo, popUndo, popRedo, canUndo, canRedo, clearUndo,
  exportAllAsJSON, importFromJSON, clearAllData,
  saveAnalyticsData, getAnalyticsData,
  // context files
  getContextFiles, saveContextFile, saveAllContextFiles, deleteContextFile,
  // moments
  createMoment, listMoments, updateMoment, deleteMoment, markMomentUsed,
  // performance
  getPerformance, savePerformance, listAllPerformance, deletePerformance,
  // last work per mode
  getLastWorkId, setLastWorkId
};
