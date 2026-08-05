/**
 * storage.js
 * Safe localStorage wrapper for the CFF app.
 *
 * - Detects whether localStorage is actually usable (private browsing,
 *   disabled storage, storage full, etc. all fail safely).
 * - Wraps every read/write in try/catch so a corrupted or blocked store
 *   never crashes the app — it just falls back to an in-memory session.
 * - Carries a version number so future releases can migrate or discard
 *   old shapes instead of throwing on stale data.
 *
 * Loaded as a plain classic script (not an ES module) so the whole site,
 * including this file, can be opened directly from disk (file://) as well
 * as served over http(s) — see index.html for load order. Declarations
 * here (saveState, loadState, clearState, storageAvailable) are used
 * directly by js/app.js, which is loaded right after this file.
 */

const STORAGE_KEY = 'cff:app-state';
const STORAGE_VERSION = 2;

function detectStorageAvailable(){
  try{
    const testKey = '__cff_storage_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return true;
  }catch(err){
    return false;
  }
}

const storageAvailable = detectStorageAvailable();

/**
 * Persist app state. Returns true on success, false otherwise.
 * Never throws.
 */
function saveState(state){
  if(!storageAvailable) return false;
  try{
    const payload = {
      version: STORAGE_VERSION,
      savedAt: new Date().toISOString(),
      state
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  }catch(err){
    // Likely quota exceeded — fail silently, app keeps working in memory.
    console.warn('CFF storage: save failed (%s)', err && err.name);
    return false;
  }
}

/**
 * Load previously saved app state, or null if none / incompatible / corrupt.
 * Never throws.
 */
function loadState(){
  if(!storageAvailable) return null;
  try{
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if(!raw) return null;

    const parsed = JSON.parse(raw);
    if(!parsed || typeof parsed !== 'object') return null;

    if(parsed.version !== STORAGE_VERSION){
      // Shape changed since this was saved. In a future release this is
      // where a migration step would live. For now, discard safely
      // rather than risk feeding the app a shape it doesn't expect.
      console.warn('CFF storage: stored version %s != current %s — discarding', parsed.version, STORAGE_VERSION);
      return null;
    }

    return parsed.state || null;
  }catch(err){
    console.warn('CFF storage: load failed, resetting (%s)', err && err.name);
    return null;
  }
}

/** Permanently remove all saved app data. Never throws. */
function clearState(){
  if(!storageAvailable) return;
  try{
    window.localStorage.removeItem(STORAGE_KEY);
  }catch(err){
    console.warn('CFF storage: clear failed (%s)', err && err.name);
  }
}
