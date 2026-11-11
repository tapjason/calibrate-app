/**
 * Whether a tab drops the save mark as it regains focus (roadmap D48): every
 * tab but Today (`index`), whose own focus takes the mark and scrolls to the
 * card. A save made over any other tab isn't Today's to scroll to later.
 */
export function dropsJustSaved(routeName: string): boolean {
  return routeName !== 'index';
}
