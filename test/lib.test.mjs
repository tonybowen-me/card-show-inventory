import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateBuyOffer,
  inventoryKey,
  inventoryToCsv,
  normalizePercentage,
  summarizeBuySession,
  summarizeInventory
} from "../public/lib.js";

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

test("calculateBuyOffer applies condition and card-level buy percentages", () => {
  assert.deepEqual(
    calculateBuyOffer(
      { marketPrice: 100, condition: "lightlyPlayed", buyPercent: 60 },
      70
    ),
    {
      marketPrice: 100,
      conditionPercent: 90,
      buyPercent: 60,
      conditionedValue: 90,
      offer: 54
    }
  );
});

test("calculateBuyOffer falls back to the transaction buy percentage", () => {
  assert.equal(
    calculateBuyOffer({ marketPrice: 20, condition: "nearMint", buyPercent: "" }, 65).offer,
    13
  );
});

test("summarizeBuySession totals market, conditioned, and offer values", () => {
  assert.deepEqual(
    summarizeBuySession(
      [
        { marketPrice: 100, condition: "nearMint", buyPercent: "" },
        { marketPrice: 50, condition: "damaged", buyPercent: 50 }
      ],
      70
    ),
    { cards: 2, marketValue: 150, conditionedValue: 120, offerTotal: 80 }
  );
});

test("normalizePercentage clamps values between zero and one hundred", () => {
  assert.equal(normalizePercentage(125), 100);
  assert.equal(normalizePercentage(-5), 0);
  assert.equal(normalizePercentage("", 70), 70);
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

test("inventoryToCsv rounds currency values to cents", () => {
  const csv = inventoryToCsv([
    {
      game: "pokemon",
      productType: "single",
      name: "Charizard ex",
      setName: "Set",
      number: "1",
      variant: "normal",
      quantity: 5,
      marketPrice: 4.74,
      sourceLabel: "TCGplayer",
      updatedAt: "2026-01-01",
      externalUrl: "https://example.com"
    }
  ]);
  assert.match(csv, /,5,4\.74,23\.70,TCGplayer,/);
});
