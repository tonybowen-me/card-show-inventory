import test from "node:test";
import assert from "node:assert/strict";
import {
  isSealedProduct,
  pickMarketPrice,
  priceChartingPrice,
  rankGroups,
  scoreProduct
} from "../server-lib.mjs";

test("rankGroups finds a set inside a sealed-product query", () => {
  const groups = [
    { groupId: 1, name: "SV08: Surging Sparks", abbreviation: "SSP", publishedOn: "2024-11-08" },
    { groupId: 2, name: "SV07: Stellar Crown", abbreviation: "SCR", publishedOn: "2024-09-13" }
  ];
  assert.equal(rankGroups(groups, "Surging Sparks Pokemon Center ETB")[0].groupId, 1);
});

test("isSealedProduct separates sealed products from cards and code cards", () => {
  assert.equal(isSealedProduct({ name: "Modern Horizons 3 - Collector Booster Display" }), true);
  assert.equal(isSealedProduct({ name: "Charizard ex" }), false);
  assert.equal(isSealedProduct({ name: "Code Card - Elite Trainer Box" }), false);
});

test("scoreProduct rewards complete product matches", () => {
  const box = scoreProduct({ name: "Surging Sparks Booster Box" }, "Surging Sparks booster box");
  const pack = scoreProduct({ name: "Surging Sparks Booster Pack" }, "Surging Sparks booster box");
  assert.ok(box > pack);
});

test("pickMarketPrice prefers normal market pricing", () => {
  const price = pickMarketPrice(
    [
      { productId: 5, subTypeName: "Holofoil", marketPrice: 20 },
      { productId: 5, subTypeName: "Normal", marketPrice: 10 }
    ],
    5
  );
  assert.equal(price.marketPrice, 10);
});

test("priceChartingPrice converts pennies to dollars", () => {
  assert.equal(priceChartingPrice({ "loose-price": 12345 }), 123.45);
  assert.equal(priceChartingPrice({}), null);
});
