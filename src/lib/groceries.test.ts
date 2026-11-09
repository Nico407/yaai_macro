import { describe, expect, it } from "vitest";
import { amountLabel, groupItems, STAPLES, type GroceryItem } from "./groceries";

const item = (name: string, aisle: string, extra: Partial<GroceryItem> = {}): GroceryItem => ({
  id: name, key: name.toLowerCase(), name, grams: 100, aisle, staple: false, recipes: [], checked: false, by_hand: false,
  from_date: null, to_date: null, ...extra,
});

describe("amountLabel", () => {
  it("rounds up to what you'd buy", () => {
    expect(amountLabel(342)).toBe("350 g");
    expect(amountLabel(3)).toBe("10 g");
    expect(amountLabel(1240)).toBe("1.3 kg");
    expect(amountLabel(2000)).toBe("2 kg");
    expect(amountLabel(null)).toBe("");
  });
  it("counts eggs, not egg whites", () => {
    expect(amountLabel(220, "Egg")).toBe("≈ 4 eggs (220 g)");
    expect(amountLabel(200, "Egg white")).toBe("200 g");
    expect(amountLabel(90, "Eggplant")).toBe("90 g");
  });
});

describe("groupItems", () => {
  it("shop order, staples last, ticked ones at the bottom of their aisle", () => {
    const groups = groupItems([
      item("Salt", "Other", { staple: true, grams: null }),
      item("Milk", "Dairy, eggs & tofu"),
      item("Leek", "Fruit & veg", { checked: true }),
      item("Carrot", "Fruit & veg"),
      item("Toilet paper", "Other", { by_hand: true }),
    ]);
    expect(groups.map(([s]) => s)).toEqual(["Fruit & veg", "Dairy, eggs & tofu", "Other", STAPLES]);
    expect(groups[0][1].map((i) => i.name)).toEqual(["Carrot", "Leek"]);
  });
});
