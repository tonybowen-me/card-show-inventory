import test from "node:test";
import assert from "node:assert/strict";
import { inventoryKey, inventoryToCsv, summarizeInventory } from "../public/lib.js";

test("inventoryKey distinguishes finishes", () => {
  assert.equal(
    inventoryKey({ source: "scryfall", sourceId: "abc", variant: "Foil" }),
    "scryfall:abc:Foil"
  );
});

test("summarizeInventory includes quantities and market value", () => {
  assert.deepEqual(
    summarizeInventory([
      { quantity: 2, marketPrice: 10 },
      { quantity: 3, marketPrice: 2.5 }
    ]),
    { products: 2, units: 5, marketValue: 27.5 }
  );
});

test("inventoryToCsv escapes commas and quotes", () => {
  const csv = inventoryToCsv([
    {
      game: "mtg",
      productType: "single",
      name: 'Card, "Special"',
      setName: "Set",
      number: "1",
      variant: "Normal",
      quantity: 1,
      marketPrice: 2,
      sourceLabel: "TCGplayer",
      updatedAt: "2026-01-01",
      externalUrl: "https://example.com"
    }
  ]);
  assert.match(csv, /"Card, ""Special"""/);
});
