import type { Prediction } from "@/types";

import { cardPlacement, locateCard } from "./locateCard";

function card(id: string): Prediction {
  return {
    id,
    user_id: "u1",
    title: id,
    category: "work",
    confidence: 70,
    created_at: "2026-11-01T12:00:00.000Z",
    due_date: "2026-11-20T12:00:00.000Z",
    status: "pending",
    resolved_at: null,
    reflection: null,
    integrity_bonus: false,
  };
}

// Roadmap D48: after a save, Today scrolls to the new card.
describe("locateCard", () => {
  const sections = [{ data: [card("r1"), card("r2")] }, { data: [card("w1")] }];

  it("counts the section header as item 0, as SectionList does", () => {
    expect(locateCard(sections, "r1")).toEqual({
      sectionIndex: 0,
      itemIndex: 1,
    });
    expect(locateCard(sections, "r2")).toEqual({
      sectionIndex: 0,
      itemIndex: 2,
    });
    expect(locateCard(sections, "w1")).toEqual({
      sectionIndex: 1,
      itemIndex: 1,
    });
  });

  it("is null for a card that is not there", () => {
    expect(locateCard(sections, "gone")).toBeNull();
  });
});

// Owner, 2026-11-10: only as far as needed.
describe("cardPlacement", () => {
  const base = {
    cardPos: 3,
    firstVisiblePos: 0,
    cardHeight: 90,
    viewHeight: 500,
    margin: 16,
  };

  it("brings a card below the view just inside the bottom edge", () => {
    expect(cardPlacement(base)).toBe("bottom");
    expect(cardPlacement({ ...base, firstVisiblePos: null })).toBe("bottom");
  });

  it("brings a card above the view just below the top", () => {
    expect(cardPlacement({ ...base, cardPos: 1, firstVisiblePos: 2 })).toBe(
      "top",
    );
  });

  it("brings a card too tall to fit to the top, so its title shows", () => {
    expect(cardPlacement({ ...base, cardHeight: 470 })).toBe("top");
    expect(cardPlacement({ ...base, cardHeight: 468 })).toBe("bottom");
  });

  it("takes a card not yet measured to fit", () => {
    expect(cardPlacement({ ...base, cardHeight: null, viewHeight: null })).toBe(
      "bottom",
    );
  });
});
