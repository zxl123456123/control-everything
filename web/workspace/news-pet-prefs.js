/*
 * Shared pet preferences. Every page that hosts or configures the pet (the news reader, the Studio mascot,
 * the Studio settings) reads and writes the same localStorage keys through this module, and `subscribe`
 * reports changes made anywhere (same page, another tab, or the Studio frame around the reader) without a reload.
 *   news-reader-pet          registered pet name, default `NewsPets.defaultName()`
 *   news-reader-pet-enabled  'true' when the pet is shown, absent/other = hidden (default)
 *   news-reader-pet-quiet    'true' = quiet mode: the pet stays but rests, with no reactions (default off)
 *   news-reader-pet-news-fx  'false' = no news-page interactions; absent = on
 *   news-reader-pet-size     'small' | 'medium' | 'large', default medium
 *   news-reader-pet-dock     'auto' | 'bl' | 'br' resting corner, default auto
 *
 * The wheel has six fixed slots and nothing to store: the keys `news-reader-pet-dial` and `news-reader-pet-dial-pin`
 * of earlier versions are deleted the first time the preference is read (nothing is migrated).
 * `<html data-pets-disabled>` stays a host-level veto owned by the embedding page: the registry drops the
 * listed pets from `list()`, so a stored choice of such a pet resolves to the default form.
 */
(function (global) {
  'use strict';
  const PREFIX = 'news-reader-pet';
  const SIZES = Object.freeze(['small', 'medium', 'large']);
  const DOCKS = Object.freeze(['auto', 'bl', 'br']);
  const RETIRED_KEYS = Object.freeze([PREFIX + '-dial', PREFIX + '-dial-pin']);
  const listeners = new Set();
  let last = null, retired = false;

  // Remote accounts keep their own copy: the context prefixes every key with the account scope.
  const storage = () => global.CERemoteContext ? global.CERemoteContext.storage('localStorage') : global.localStorage;
  const names = () => global.NewsPets ? global.NewsPets.list().map(pet => pet.name) : ['spider'];
  const fallbackName = () => global.NewsPets?.defaultName() || 'spider';
  const flag = (raw, fallback) => raw === 'true' ? true : raw === 'false' ? false : fallback;
  const pick = (allowed, fallback) => raw => allowed.includes(raw) ? raw : fallback;

  // field -> storage key, how to parse a stored string, how to validate and serialise a new value
  const FIELDS = {
    pet: {key: PREFIX, parse: raw => names().includes(raw) ? raw : fallbackName(), valid: value => names().includes(value), write: String},
    enabled: {key: PREFIX + '-enabled', parse: raw => raw === 'true', valid: value => typeof value === 'boolean', write: String},
    quiet: {key: PREFIX + '-quiet', parse: raw => raw === 'true', valid: value => typeof value === 'boolean', write: String},
    newsFx: {key: PREFIX + '-news-fx', parse: raw => flag(raw, true), valid: value => typeof value === 'boolean', write: String},
    size: {key: PREFIX + '-size', parse: pick(SIZES, 'medium'), valid: value => SIZES.includes(value), write: String},
    dock: {key: PREFIX + '-dock', parse: pick(DOCKS, 'auto'), valid: value => DOCKS.includes(value), write: String},
  };
  const same = (a, b) => Boolean(a) && Object.keys(FIELDS).every(field => String(a[field]) === String(b[field]));

  /** Removes the keys of the retired wheel settings, once; the flag is only set when the storage accepted every removal. */
  function retireLegacyKeys(store) {
    if (retired || !store) return;
    try { for (const key of RETIRED_KEYS) store.removeItem(key); retired = true; } catch { /* read-only storage: try again next time */ }
  }

  /** @returns {{pet: string, enabled: boolean, quiet: boolean, newsFx: boolean, size: string, dock: string}} the stored preference, always valid. */
  function read() {
    const out = {};
    let store = null;
    try { store = storage(); } catch { /* storage blocked: defaults */ }
    retireLegacyKeys(store);
    for (const [field, spec] of Object.entries(FIELDS)) {
      let raw = null;
      try { raw = store ? store.getItem(spec.key) : null; } catch { /* unreadable key: default */ }
      out[field] = spec.parse(raw);
    }
    return out;
  }

  function publish() {
    const next = read();
    if (same(last, next)) return;
    last = next;
    for (const listener of [...listeners]) listener(next);
  }

  /**
   * Stores several fields at once; listeners hear about the change once.
   * Returns false, writing nothing, when a value is invalid, or when storage refuses a write.
   * @param {Partial<ReturnType<typeof read>>} patch
   */
  function set(patch) {
    const entries = Object.entries(patch || {});
    if (!entries.length || entries.some(([field, value]) => !FIELDS[field]?.valid(value))) return false;
    try {
      const store = storage();
      for (const [field, value] of entries) store.setItem(FIELDS[field].key, FIELDS[field].write(value));
    } catch { return false; }
    publish();
    return true;
  }

  /** Stores the pet form. Returns false for unknown names or when storage refuses the write. */
  const setPet = name => set({pet: name});
  /** Stores the on/off switch. Returns false when storage refuses the write. */
  const setEnabled = enabled => set({enabled: Boolean(enabled)});

  /**
   * Calls `listener` with the new preference whenever it changes. Returns an unsubscribe function.
   * @param {(prefs: ReturnType<typeof read>) => void} listener
   */
  function subscribe(listener) {
    if (!listeners.size) {
      last = read();
      global.addEventListener('storage', onStorage);
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) global.removeEventListener('storage', onStorage);
    };
  }

  // Remote contexts store keys as `ce.remote.<scope>.<key>`, so match on the suffix; a null key means storage was cleared.
  const onStorage = event => { if (event.key === null || Object.values(FIELDS).some(spec => event.key.endsWith(spec.key))) publish(); };

  global.NewsPetPrefs = Object.freeze({read, set, setPet, setEnabled, subscribe, SIZES, DOCKS});
})(window);
