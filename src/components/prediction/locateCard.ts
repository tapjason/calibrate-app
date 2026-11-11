import type { Prediction } from "@/types";

/** A card's place in Today's SectionList (`scrollToLocation`). */
export interface CardLocation {
  sectionIndex: number;
  itemIndex: number;
}

/**
 * Where a prediction sits in Today's sections, in SectionList's own terms:
 * `itemIndex` counts the section's header as 0, so the first card is 1
 * (`scrollToLocation`, react-native and react-native-web alike).
 */
export function locateCard(
  sections: readonly { data: readonly Prediction[] }[],
  id: string,
): CardLocation | null {
  for (let s = 0; s < sections.length; s++) {
    const i = sections[s].data.findIndex((p) => p.id === id);
    if (i >= 0) return { sectionIndex: s, itemIndex: i + 1 };
  }
  return null;
}

/** Which edge a card is brought to: just inside the bottom, or just below the top. */
export type CardPlacement = "bottom" | "top";

/**
 * Where Today brings a card that isn't all on screen (roadmap D48; owner,
 * 2026-11-10): only as far as needed, so its bottom sits just above the
 * bottom edge and what's above it (on Day 0, the first answer's day and the
 * reminder ask) stays in view. Just below the top instead when it's above
 * what's shown, or too tall to fit, so its title shows.
 *
 * `cardPos` and `firstVisiblePos` count cards in reading order; the first
 * visible one is null when no card is all on screen. Heights are null until
 * measured, and then the card is taken to fit.
 */
export function cardPlacement(input: {
  cardPos: number;
  firstVisiblePos: number | null;
  cardHeight: number | null;
  viewHeight: number | null;
  margin: number;
}): CardPlacement {
  if (input.firstVisiblePos !== null && input.cardPos < input.firstVisiblePos)
    return "top";
  if (
    input.cardHeight !== null &&
    input.viewHeight !== null &&
    input.cardHeight + 2 * input.margin > input.viewHeight
  ) {
    return "top";
  }
  return "bottom";
}
