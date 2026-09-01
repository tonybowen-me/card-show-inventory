export function formatCurrency(value) {
  if (!Number.isFinite(Number(value))) {
    return "—";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(Number(value));
}

export function normalizeMarketPrice(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : null;
}

export function formatRelativeDate(value) {
  if (!value) {
    return "Never";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Never";
  }
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const ranges = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60]
  ];
  for (const [unit, size] of ranges) {
    if (Math.abs(seconds) >= size) {
      return formatter.format(Math.round(seconds / size), unit);
    }
  }
  return "just now";
}

export function inventoryKey(item) {
  return [item.source, item.sourceId, item.variant].join(":");
}

export const DEFAULT_CONDITION_PERCENTAGES = Object.freeze({
  nearMint: 100,
  lightlyPlayed: 90,
  moderatelyPlayed: 75,
  heavilyPlayed: 60,
  damaged: 40
});

export function normalizePercentage(value, fallback = 0) {
  if (value === null || value === undefined || value === "") {
    return Math.min(100, Math.max(0, Number(fallback) || 0));
  }
  return Math.min(100, Math.max(0, Number(value) || 0));
}

export function normalizeBuySessionStore(store, legacySession, createId, now) {
  const fallbackTime = String(now || new Date().toISOString());
  const normalizeSession = (session = {}) => {
    const createdAt = String(session.createdAt || fallbackTime);
    return {
      id: String(session.id || createId()),
      name: String(session.name || ""),
      items: Array.isArray(session.items) ? session.items : [],
      defaultBuyPercent: normalizePercentage(session.defaultBuyPercent, 70),
      createdAt,
      updatedAt: String(session.updatedAt || createdAt)
    };
  };
  let sessions = Array.isArray(store?.sessions) ? store.sessions.map(normalizeSession) : [];
  if (!sessions.length && legacySession && typeof legacySession === "object") {
    sessions = [normalizeSession(legacySession)];
  }
  if (!sessions.length) {
    sessions = [normalizeSession()];
  }
  const activeSessionId = sessions.some((session) => session.id === store?.activeSessionId)
    ? store.activeSessionId
    : sessions[0].id;
  return { activeSessionId, sessions };
}

function roundCurrency(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateBuyOffer(
  item,
  defaultBuyPercent,
  conditionPercentages = DEFAULT_CONDITION_PERCENTAGES
) {
  const marketPrice = normalizeMarketPrice(item.marketPrice) || 0;
  const conditionPercent = normalizePercentage(
    conditionPercentages[item.condition],
    DEFAULT_CONDITION_PERCENTAGES[item.condition] ?? 100
  );
  const buyPercent = normalizePercentage(item.buyPercent, defaultBuyPercent);
  const conditionedValue = roundCurrency(marketPrice * (conditionPercent / 100));
  return {
    marketPrice,
    conditionPercent,
    buyPercent,
    conditionedValue,
    offer: roundCurrency(conditionedValue * (buyPercent / 100))
  };
}

export function summarizeBuySession(
  items,
  defaultBuyPercent,
  conditionPercentages = DEFAULT_CONDITION_PERCENTAGES
) {
  return items.reduce(
    (summary, item) => {
      const calculation = calculateBuyOffer(item, defaultBuyPercent, conditionPercentages);
      summary.marketValue += calculation.marketPrice;
      summary.conditionedValue += calculation.conditionedValue;
      summary.offerTotal += calculation.offer;
      return summary;
    },
    { cards: items.length, marketValue: 0, conditionedValue: 0, offerTotal: 0 }
  );
}

export function summarizeInventory(items) {
  return items.reduce(
    (summary, item) => {
      const quantity = Math.max(0, Number(item.quantity) || 0);
      summary.units += quantity;
      summary.marketValue += (Number(item.marketPrice) || 0) * quantity;
      return summary;
    },
    { products: items.length, units: 0, marketValue: 0 }
  );
}

function csvCell(value) {
  const string = String(value ?? "");
  return /[",\n]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
}

export function inventoryToCsv(items) {
  const headers = [
    "Game",
    "Type",
    "Name",
    "Set",
    "Number",
    "Variant",
    "Quantity",
    "Market Price",
    "Market Value",
    "Source",
    "Last Refreshed",
    "Product URL"
  ];
  const rows = items.map((item) => {
    const marketPrice = normalizeMarketPrice(item.marketPrice);
    const quantity = Number(item.quantity) || 0;
    return [
      item.game === "mtg" ? "Magic: The Gathering" : "Pokémon",
      item.productType,
      item.name,
      item.setName,
      item.number,
      item.variant,
      item.quantity,
      marketPrice === null ? "" : marketPrice.toFixed(2),
      marketPrice === null ? "" : (marketPrice * quantity).toFixed(2),
      item.sourceLabel,
      item.updatedAt,
      item.externalUrl
    ];
  });
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
