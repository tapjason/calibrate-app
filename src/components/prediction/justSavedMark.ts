/**
 * Whether a tab drops the save mark as it regains focus (roadmap D48): every
 * tab but Today (`index`), whose own focus takes the mark and scrolls to the
 * card. A save made over any other tab isn't Today's to scroll to later.
 */
export function dropsJustSaved(routeName: string): boolean {
  return routeName !== 'index';
}

/**
 * Whether a tab shows "Saved, due …" as a Log sheet closes back to it: the two
 * with a "+" besides Today (blind playtests 2026-11-12c, -12d). You has no
 * "+"; a save from a reminder's Resolve there already said "Logged again".
 */
export function showsSavedNotice(routeName: string): boolean {
  return routeName === 'insights' || routeName === 'history';
}
