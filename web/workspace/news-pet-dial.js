/*
 * The pet wheel's six fixed slots, as data. An action owns its place on the clock face for good: it never moves when
 * another one is unavailable, so the hand learns "search is at four o'clock" and never has to look again. A page that
 * cannot run an action greys its slot out and says why; it does not reflow the ring. (Same rule as Blender's pie menus,
 * https://developer.blender.org/docs/features/interface/human_interface_guidelines/layouts/ .)
 *   group 'page'  the right half, 12 to 4 o'clock: where you can go
 *   group 'pet'   the left half, 6 to 10 o'clock: what the pet itself does
 * Hosts (the news reader, the Studio mascot) own what each action does; see NewsPetDirector.createActions.
 */
(function (global) {
  'use strict';
  /** Clockwise from 12 o'clock, in degrees. */
  const SLOTS = Object.freeze([
    {id: 'workspace', angle: 0, group: 'page', label: '打开工作台', icon: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z'},
    {id: 'news', angle: 60, group: 'page', label: '去看新闻', icon: 'M5 5h11v14H5z M16 9h3v8a2 2 0 0 1-2 2 M8 9h5 M8 13h5'},
    {id: 'search', angle: 120, group: 'page', label: '搜索新闻', icon: 'M10.5 3a7.5 7.5 0 1 0 0 15a7.5 7.5 0 1 0 0-15z M16 16l5 5'},
    {id: 'quiet', angle: 180, group: 'pet', label: '安静模式', icon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z'},
    {id: 'pet-settings', angle: 240, group: 'pet', label: '宠物设置', icon: 'M4 7h10 M18 7h2 M4 17h2 M10 17h10 M16 5v4 M8 15v4'},
    {id: 'hide-pet', angle: 300, group: 'pet', label: '隐藏宠物', icon: 'M3 3l18 18 M10.6 6.2A9.5 9.5 0 0 1 12 6c5 0 8.5 4.5 9.5 6a14 14 0 0 1-2.4 2.9 M6.6 7.7A14 14 0 0 0 2.5 12C3.5 13.5 7 18 12 18c1.2 0 2.3-.3 3.3-.7'},
  ].map(Object.freeze));
  const byId = new Map(SLOTS.map(slot => [slot.id, slot]));

  /** Reasons a greyed slot gives; the host picks one, the wheel prints it in the label and aria-label. */
  const REASONS = Object.freeze({here: '当前页', newsOnly: '仅新闻页', unavailable: '暂不可用'});

  /** The slot for an id, or undefined. */
  const slot = id => byId.get(id);

  global.NewsPetDial = Object.freeze({SLOTS, REASONS, slot});
})(window);
