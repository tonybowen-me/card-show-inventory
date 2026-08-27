export function formatCurrency(value) {
  if (!Number.isFinite(Number(value))) {
    return "—";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(Number(value));
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
  const rows = items.map((item) => [
    item.game === "mtg" ? "Magic: The Gathering" : "Pokémon",
    item.productType,
    item.name,
    item.setName,
    item.number,
    item.variant,
    item.quantity,
    item.marketPrice,
    (Number(item.marketPrice) || 0) * (Number(item.quantity) || 0),
    item.sourceLabel,
    item.updatedAt,
    item.externalUrl
  ]);
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
