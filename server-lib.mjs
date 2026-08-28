const GENERIC_PRODUCT_WORDS = new Set([
  "and",
  "box",
  "booster",
  "bundle",
  "case",
  "collector",
  "collection",
  "deck",
  "display",
  "elite",
  "etb",
  "exclusive",
  "gift",
  "kit",
  "magic",
  "mtg",
  "pack",
  "play",
  "pokemon",
  "premium",
  "sealed",
  "set",
  "tcg",
  "the",
  "tin",
  "trainer"
]);

const SEALED_TERMS = [
  "booster",
  "display",
  "box",
  "bundle",
  "kit",
  "deck",
  "pack",
  "collection",
  "tin",
  "blister",
  "case",
  "prerelease",
  "pre release",
  "build battle",
  "starter",
  "gift",
  "portfolio",
  "album",
  "poster",
  "chest"
];

export function normalizeText(value = "") {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function tokenize(value = "") {
  return normalizeText(value).split(" ").filter(Boolean);
}

export function isSealedProduct(product) {
  const name = normalizeText(product?.name);
  if (!name || name.includes("code card") || name.includes("digital")) {
    return false;
  }

  return SEALED_TERMS.some((term) => name.includes(term));
}

export function rankGroups(groups, query, limit = 5) {
  const normalizedQuery = normalizeText(query);
  const queryTokens = tokenize(query).filter((token) => !GENERIC_PRODUCT_WORDS.has(token));

  return groups
    .map((group) => {
      const normalizedName = normalizeText(group.name);
      const nameTokens = new Set(tokenize(group.name));
      const abbreviation = normalizeText(group.abbreviation);
      let score = 0;

      if (normalizedQuery.includes(normalizedName) && normalizedName.length > 2) {
        score += 80;
      }
      if (normalizedName.includes(normalizedQuery) && normalizedQuery.length > 2) {
        score += 60;
      }
      if (abbreviation && queryTokens.includes(abbreviation)) {
        score += 50;
      }

      for (const token of queryTokens) {
        if (nameTokens.has(token)) {
          score += token.length > 3 ? 12 : 7;
        } else if (normalizedName.includes(token)) {
          score += 4;
        }
      }

      return { ...group, score };
    })
    .filter((group) => group.score > 0)
    .sort((a, b) => b.score - a.score || String(b.publishedOn).localeCompare(String(a.publishedOn)))
    .slice(0, limit);
}

export function scoreProduct(product, query) {
  const normalizedName = normalizeText(product.name);
  const normalizedQuery = normalizeText(query);
  const queryTokens = tokenize(query);
  let score = 0;

  if (normalizedName === normalizedQuery) {
    score += 200;
  } else if (normalizedName.includes(normalizedQuery)) {
    score += 100;
  }

  for (const token of queryTokens) {
    if (normalizedName.split(" ").includes(token)) {
      score += GENERIC_PRODUCT_WORDS.has(token) ? 4 : 12;
    } else if (normalizedName.includes(token)) {
      score += 2;
    }
  }

  return score;
}

export function normalizeMarketPrice(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : null;
}

export function pickMarketPrice(prices = [], productId) {
  const matching = prices.filter((price) => String(price.productId) === String(productId));
  const preferred = matching.find(
    (price) => price.subTypeName === "Normal" && normalizeMarketPrice(price.marketPrice) !== null
  );
  const fallback = matching.find((price) => normalizeMarketPrice(price.marketPrice) !== null);
  return preferred ?? fallback ?? null;
}

export function priceChartingPrice(product) {
  const pennies = normalizeMarketPrice(product?.["loose-price"]);
  return pennies === null ? null : pennies / 100;
}
