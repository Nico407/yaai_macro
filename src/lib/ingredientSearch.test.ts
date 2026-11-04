import { describe, expect, it } from "vitest";
import { sameFood, searchIngredients } from "./ingredientSearch";

const list = [
  { id: "1", name: "Chicken, breast, without skin, raw (Switzerland)", name_de: "Poulet, Brust, ohne Haut, roh (Schweiz)", source: "swiss-fcdb" },
  { id: "2", name: "Chicken breast (raw)", name_de: null, source: null },
  { id: "3", name: "Rice polished, cooked", name_de: "Reis poliert, gekocht", source: "swiss-fcdb" },
  { id: "4", name: "Café crème", name_de: null, source: null },
];

describe("ingredient search", () => {
  it("finds by English or German words, your own first", () => {
    expect(searchIngredients(list, "chicken breast").map((i) => i.id)).toEqual(["2", "1"]);
    expect(searchIngredients(list, "poulet").map((i) => i.id)).toEqual(["1"]);
    expect(searchIngredients(list, "reis gekocht").map((i) => i.id)).toEqual(["3"]);
    expect(searchIngredients(list, "cafe").map((i) => i.id)).toEqual(["4"]);
  });
  it("spots the same food under another spelling", () => {
    expect(sameFood("Chicken breast (raw)", "Chicken, breast, raw")).toBe(true);
    expect(sameFood("Eggs", "Egg, raw")).toBe(true);
    expect(sameFood("Broccoli", "Broccoli, steamed")).toBe(false);
  });
});
