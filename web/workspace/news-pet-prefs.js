/*
 * Shared pet preferences: whether pets are shown at all and which one.
 * Every page that hosts or configures pets (the news reader, the Studio settings) reads and writes
 * the same two localStorage keys through this module, and `subscribe` reports changes made anywhere
 * (same page, another tab, or the Studio frame around the reader) without a reload.
 *   news-reader-pet          registered pet name, default `NewsPets.defaultName()`
 *   news-reader-pet-enabled  'true' when pets are shown, absent/other = hidden (default)
 * `<html data-pets-disabled>` stays a host-level veto owned by the embedding page: the registry drops the
 * listed pets from `list()`, so a stored choice of such a pet resolves to the default form.
 */
(function (global) {
  'use strict';
  const PET_KEY = 'news-reader-pet';
  const ENABLED_KEY = 'news-reader-pet-enabled';
  const listeners = new Set();
  let last = null;

  // Remote accounts keep their own copy: the context prefixes every key with the account scope.
  const storage = () => global.CERemoteContext ? global.CERemoteContext.storage('localStorage') : global.localStorage;
  const names = () => global.NewsPets ? global.NewsPets.list().map(pet => pet.name) : ['spider'];
  const fallbackName = () => global.NewsPets?.defaultName() || 'spider';
  const same = (a, b) => Boolean(a) && a.pet === b.pet && a.enabled === b.enabled;

  /** @returns {{pet: string, enabled: boolean}} the stored preference, always valid. */
  function read() {
    let pet = null, enabled = false;
    try { const store = storage(); pet = store.getItem(PET_KEY); enabled = store.getItem(ENABLED_KEY) === 'true'; } catch { /* storage blocked: defaults */ }
    return {pet: names().includes(pet) ? pet : fallbackName(), enabled};
  }

  function publish() {
    const next = read();
    if (same(last, next)) return;
    last = next;
    for (const listener of [...listeners]) listener(next);
  }

  function write(key, value) {
    try { storage().setItem(key, value); } catch { return false; }
    publish();
    return true;
  }

  /** Stores the pet form. Returns false for unknown names or when storage refuses the write. */
  const setPet = name => names().includes(name) && write(PET_KEY, name);
  /** Stores the on/off switch. Returns false when storage refuses the write. */
  const setEnabled = enabled => write(ENABLED_KEY, String(Boolean(enabled)));

  /**
   * Calls `listener` with the new preference whenever it changes. Returns an unsubscribe function.
   * @param {(prefs: {pet: string, enabled: boolean}) => void} listener
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
  function onStorage(event) {
    if (event.key === null || event.key.endsWith(PET_KEY) || event.key.endsWith(ENABLED_KEY)) publish();
  }

  global.NewsPetPrefs = Object.freeze({read, setPet, setEnabled, subscribe});
})(window);
