import { describe, expect, it } from "vitest";
import { facetsOf, fitsLifestyle } from "./recipeFacets";

describe("facetsOf", () => {
  it("finds base, protein and lifestyle from ingredient lines", () => {
    const f = facetsOf(["150 g chicken breast", "80 g basmati rice", "1 tbsp soy sauce"], { country: "Japan" });
    expect(f).toEqual({ bases: ["Rice"], proteins: ["Chicken"], lifestyle: "Omnivore", country: "Japan" });
  });
  it("tells vegetarian from vegan", () => {
    expect(facetsOf(["2 eggs", "1 slice sourdough bread"]).lifestyle).toBe("Vegetarian");
    expect(facetsOf(["200 g firm tofu", "100 g udon noodles", "coconut milk"]).lifestyle).toBe("Vegan");
    expect(facetsOf(["200 g firm tofu", "100 g udon noodles"]).proteins).toEqual(["Tofu & tempeh"]);
  });
  it("isn't fooled by look-alikes", () => {
    const f = facetsOf(["1 eggplant", "green beans", "peanut butter", "oat milk"], { name: "Veggie bowl" });
    expect(f.proteins).toEqual([]);
    expect(f.lifestyle).toBe("Vegan");
    expect(f.bases).toEqual([]);                            // oat milk isn't a base
    expect(facetsOf(["2 tbsp rice vinegar", "salmon"]).bases).toEqual([]);
  });
  it("maps cuisine tags of own recipes to a country", () => {
    expect(facetsOf(["penne", "tomato"], { cuisineTags: ["quick", "italian"] }).country).toBe("Italy");
  });
  it("uses the name too (Rösti, Protein Shake)", () => {
    expect(facetsOf([], { name: "Rösti" }).bases).toEqual(["Potatoes"]);
    expect(facetsOf(["water"], { name: "Protein Shake" }).proteins).toEqual(["Protein powder"]);
  });
});

describe("fitsLifestyle", () => {
  it("vegan suits everyone, meat only omnivores", () => {
    expect(fitsLifestyle("Vegan", "Vegetarian")).toBe(true);
    expect(fitsLifestyle("Omnivore", "Vegetarian")).toBe(false);
    expect(fitsLifestyle("Vegetarian", "Omnivore")).toBe(true);
  });
});
