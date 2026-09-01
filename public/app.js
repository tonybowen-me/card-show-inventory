import {
  calculateBuyOffer,
  DEFAULT_CONDITION_PERCENTAGES,
  escapeHtml,
  formatCurrency,
  formatRelativeDate,
  inventoryKey,
  inventoryToCsv,
  normalizeBuySessionStore,
  normalizePercentage,
  normalizeMarketPrice,
  summarizeBuySession,
  summarizeInventory
} from "./lib.js";

const STORAGE_KEY = "card-show-inventory:v1";
const SETTINGS_KEY = "card-show-inventory:settings:v1";
const BUY_SESSION_KEY = "card-show-inventory:buy-session:v1";
const BUY_SESSION_STORE_KEY = "card-show-inventory:buy-sessions:v1";
const CONDITIONS = [
  ["nearMint", "Near Mint"],
  ["lightlyPlayed", "Lightly Played"],
  ["moderatelyPlayed", "Moderately Played"],
  ["heavilyPlayed", "Heavily Played"],
  ["damaged", "Damaged"]
];

const elements = {
  backupButton: document.querySelector("#backupButton"),
  buyBackupButton: document.querySelector("#buyBackupButton"),
  buyCardCount: document.querySelector("#buyCardCount"),
  buyConditionedValue: document.querySelector("#buyConditionedValue"),
  buyEmptyState: document.querySelector("#buyEmptyState"),
  buyList: document.querySelector("#buyList"),
  buyMarketValue: document.querySelector("#buyMarketValue"),
  buyOfferTotal: document.querySelector("#buyOfferTotal"),
  buyPanel: document.querySelector("#buyPanel"),
  buySessionName: document.querySelector("#buySessionName"),
  buySummary: document.querySelector("#buySummary"),
  conditionSettings: [...document.querySelectorAll("[data-condition-setting]")],
  defaultBuyPercent: document.querySelector("#defaultBuyPercent"),
  emptyState: document.querySelector("#emptyState"),
  exportCsvButton: document.querySelector("#exportCsvButton"),
  gameSelect: document.querySelector("#gameSelect"),
  inventoryFilter: document.querySelector("#inventoryFilter"),
  inventoryList: document.querySelector("#inventoryList"),
  inventoryPanel: document.querySelector("#inventoryPanel"),
  inventorySort: document.querySelector("#inventorySort"),
  inventorySummary: document.querySelector("#inventorySummary"),
  lastRefresh: document.querySelector("#lastRefresh"),
  localSessionCount: document.querySelector("#localSessionCount"),
  localSessionList: document.querySelector("#localSessionList"),
  marketValue: document.querySelector("#marketValue"),
  newBuySessionButton: document.querySelector("#newBuySessionButton"),
  onlineStatus: document.querySelector("#onlineStatus"),
  priceChartingToken: document.querySelector("#priceChartingToken"),
  productCount: document.querySelector("#productCount"),
  productTypeSelect: document.querySelector("#productTypeSelect"),
  refreshAllButton: document.querySelector("#refreshAllButton"),
  refreshButtonLabel: document.querySelector("#refreshButtonLabel"),
  restoreInput: document.querySelector("#restoreInput"),
  saveConditionSettingsButton: document.querySelector("#saveConditionSettingsButton"),
  saveSettingsButton: document.querySelector("#saveSettingsButton"),
  searchButton: document.querySelector("#searchButton"),
  searchForm: document.querySelector("#searchForm"),
  searchHint: document.querySelector("#searchHint"),
  searchEyebrow: document.querySelector("#searchEyebrow"),
  searchInput: document.querySelector("#searchInput"),
  searchResults: document.querySelector("#searchResults"),
  searchStatus: document.querySelector("#searchStatus"),
  searchTitle: document.querySelector("#searchTitle"),
  settingsPanel: document.querySelector("#settingsPanel"),
  sourceSelect: document.querySelector("#sourceSelect"),
  unitCount: document.querySelector("#unitCount"),
  viewButtons: [...document.querySelectorAll("[data-view]")]
};

const savedSettings = readJson(SETTINGS_KEY, {});
const savedBuySession = readJson(BUY_SESSION_KEY, {});
const savedBuySessionStore = normalizeBuySessionStore(
  readJson(BUY_SESSION_STORE_KEY, null),
  savedBuySession,
  () => crypto.randomUUID()
);
const state = {
  inventory: readJson(STORAGE_KEY, []),
  settings: {
    priceChartingToken: savedSettings.priceChartingToken || "",
    conditionPercentages: {
      ...DEFAULT_CONDITION_PERCENTAGES,
      ...(savedSettings.conditionPercentages || {})
    }
  },
  buySessions: savedBuySessionStore.sessions,
  buySession: savedBuySessionStore.sessions.find(
    (session) => session.id === savedBuySessionStore.activeSessionId
  ),
  searchResults: [],
  refreshing: false,
  view: location.hash === "#buy" ? "buy" : "inventory"
};
localStorage.setItem(BUY_SESSION_STORE_KEY, JSON.stringify(savedBuySessionStore));

elements.priceChartingToken.value = state.settings.priceChartingToken || "";
elements.defaultBuyPercent.value = state.buySession.defaultBuyPercent;
for (const input of elements.conditionSettings) {
  input.value = state.settings.conditionPercentages[input.dataset.conditionSetting];
}

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function saveInventory() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.inventory));
}

function saveBuySession(touch = true) {
  if (touch) {
    state.buySession.updatedAt = new Date().toISOString();
  }
  localStorage.setItem(
    BUY_SESSION_STORE_KEY,
    JSON.stringify({
      activeSessionId: state.buySession.id,
      sessions: state.buySessions
    })
  );
}

function createBuySession(name = "") {
  const timestamp = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name,
    items: [],
    defaultBuyPercent: 70,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function buySessionLabel(session) {
  const name = String(session.name || "").trim();
  if (name) return name;
  const date = new Date(session.createdAt);
  return Number.isNaN(date.getTime())
    ? "Untitled buy"
    : `Buy · ${date.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      })}`;
}

function saveSettings() {
  state.settings.priceChartingToken = elements.priceChartingToken.value.trim();
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadBackup() {
  download(
    `card-show-inventory-backup-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(
      {
        version: 2,
        exportedAt: new Date().toISOString(),
        inventory: state.inventory,
        buySessions: {
          activeSessionId: state.buySession.id,
          sessions: state.buySessions
        },
        conditionPercentages: state.settings.conditionPercentages
      },
      null,
      2
    ),
    "application/json"
  );
}

function productImage(item, className = "") {
  if (!item.image) {
    return `<div class="image-fallback ${className}" aria-hidden="true">${item.game === "mtg" ? "MTG" : "PKM"}</div>`;
  }
  return `<img class="${className}" src="${escapeHtml(item.image)}" alt="" loading="lazy" />`;
}

function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function variantLabel(value) {
  return String(value || "Market")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function showStatus(message, kind = "info") {
  elements.searchStatus.hidden = false;
  elements.searchStatus.className = `status-message ${kind}`;
  elements.searchStatus.textContent = message;
}

function hideStatus() {
  elements.searchStatus.hidden = true;
}

function renderSearchResults() {
  if (!state.searchResults.length) {
    elements.searchResults.innerHTML = "";
    return;
  }

  elements.searchResults.innerHTML = `
    <div class="results-heading">
      <strong>${state.searchResults.length} result${state.searchResults.length === 1 ? "" : "s"}</strong>
      <span>Select the exact product and finish.</span>
    </div>
    <div class="result-grid">
      ${state.searchResults
        .map((item, index) => {
          const url = safeExternalUrl(item.externalUrl);
          return `
            <article class="result-card">
              ${productImage(item, "result-image")}
              <div class="result-copy">
                <div>
                  <span class="pill">${escapeHtml(item.productType)}</span>
                  <h3>${escapeHtml(item.name)}</h3>
                  <p>${escapeHtml(item.setName)}${item.number ? ` · #${escapeHtml(item.number)}` : ""}</p>
                  <p class="variant">${escapeHtml(variantLabel(item.variant))}</p>
                </div>
                <div class="result-price">
                  <span>${escapeHtml(item.sourceLabel)} market</span>
                  <strong>${formatCurrency(item.marketPrice)}</strong>
                </div>
                <div class="result-actions">
                  ${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">View listing</a>` : ""}
                  <button class="primary compact" data-add-result="${index}" type="button">${
                    state.view === "buy" ? "Add to buy" : "Add"
                  }</button>
                </div>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function inventorySort(items) {
  const sort = elements.inventorySort.value;
  return [...items].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "value") {
      return b.marketPrice * b.quantity - a.marketPrice * a.quantity;
    }
    if (sort === "price") return (b.marketPrice || 0) - (a.marketPrice || 0);
    if (sort === "updated") return String(b.updatedAt).localeCompare(String(a.updatedAt));
    return String(b.addedAt).localeCompare(String(a.addedAt));
  });
}

function priceChange(item) {
  if (!Number.isFinite(item.previousPrice) || item.previousPrice === item.marketPrice) {
    return "";
  }
  const difference = item.marketPrice - item.previousPrice;
  const className = difference > 0 ? "up" : "down";
  return `<span class="price-change ${className}">${difference > 0 ? "↑" : "↓"} ${formatCurrency(
    Math.abs(difference)
  )}</span>`;
}

function renderInventory() {
  const summary = summarizeInventory(state.inventory);
  const refreshed = state.inventory
    .map((item) => item.updatedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  elements.productCount.textContent = summary.products.toLocaleString();
  elements.unitCount.textContent = summary.units.toLocaleString();
  elements.marketValue.textContent = formatCurrency(summary.marketValue);
  elements.lastRefresh.textContent = formatRelativeDate(refreshed);

  const filter = elements.inventoryFilter.value.trim().toLowerCase();
  const visible = inventorySort(
    state.inventory.filter((item) =>
      [item.name, item.setName, item.variant, item.sourceLabel].some((value) =>
        String(value).toLowerCase().includes(filter)
      )
    )
  );

  elements.emptyState.hidden = state.inventory.length > 0;
  if (!visible.length && state.inventory.length) {
    elements.inventoryList.innerHTML = `<div class="filter-empty">No inventory matches that filter.</div>`;
    return;
  }

  elements.inventoryList.innerHTML = visible
    .map((item) => {
      const key = escapeHtml(inventoryKey(item));
      const unitPrice = Number(item.marketPrice);
      const total = unitPrice * Number(item.quantity);
      const url = safeExternalUrl(item.externalUrl);
      return `
        <article class="inventory-item ${item.priceError ? "has-error" : ""}">
          ${productImage(item, "inventory-image")}
          <div class="inventory-product">
            <div class="inventory-name-row">
              <div>
                <span class="pill">${item.game === "mtg" ? "MTG" : "Pokémon"} · ${escapeHtml(
                  item.productType
                )}</span>
                <h3>${escapeHtml(item.name)}</h3>
                <p>${escapeHtml(item.setName)}${item.number ? ` · #${escapeHtml(item.number)}` : ""}</p>
                <p class="variant">${escapeHtml(variantLabel(item.variant))} · ${escapeHtml(
                  item.sourceLabel
                )}</p>
              </div>
              <button class="icon-button delete-button" data-delete="${key}" type="button" aria-label="Remove ${escapeHtml(
                item.name
              )}">×</button>
            </div>
            <div class="inventory-metrics">
              <div>
                <span>Market</span>
                <strong>${formatCurrency(item.marketPrice)}</strong>
                ${priceChange(item)}
              </div>
              <label class="quantity-control">
                <span>Quantity</span>
                <div>
                  <button data-quantity="${key}" data-delta="-1" type="button" aria-label="Decrease quantity">−</button>
                  <input data-quantity-input="${key}" type="number" min="1" max="9999" value="${Number(
                    item.quantity
                  )}" aria-label="Quantity" />
                  <button data-quantity="${key}" data-delta="1" type="button" aria-label="Increase quantity">+</button>
                </div>
              </label>
              <div>
                <span>Total value</span>
                <strong>${formatCurrency(total)}</strong>
              </div>
            </div>
            <div class="inventory-meta">
              <span class="${item.priceError ? "error-text" : ""}">
                ${
                  item.priceError
                    ? escapeHtml(item.priceError)
                    : `Updated ${formatRelativeDate(item.updatedAt)}`
                }
              </span>
              <div>
                ${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">Source</a>` : ""}
                <button class="text-button" data-refresh="${key}" type="button">Refresh</button>
              </div>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function conditionOptions(selected) {
  return CONDITIONS.map(
    ([value, label]) =>
      `<option value="${value}"${value === selected ? " selected" : ""}>${label}</option>`
  ).join("");
}

function renderBuySession() {
  const summary = summarizeBuySession(
    state.buySession.items,
    state.buySession.defaultBuyPercent,
    state.settings.conditionPercentages
  );
  elements.buyCardCount.textContent = summary.cards.toLocaleString();
  elements.buyMarketValue.textContent = formatCurrency(summary.marketValue);
  elements.buyConditionedValue.textContent = formatCurrency(summary.conditionedValue);
  elements.buyOfferTotal.textContent = formatCurrency(summary.offerTotal);
  elements.buySessionName.value = state.buySession.name;
  elements.buyEmptyState.hidden = state.buySession.items.length > 0;

  elements.buyList.innerHTML = state.buySession.items
    .map((item) => {
      const id = escapeHtml(item.buyItemId);
      const calculation = calculateBuyOffer(
        item,
        state.buySession.defaultBuyPercent,
        state.settings.conditionPercentages
      );
      const url = safeExternalUrl(item.externalUrl);
      const override = item.buyPercent === "" || item.buyPercent === null ? "" : item.buyPercent;
      return `
        <article class="inventory-item buy-item ${item.priceError ? "has-error" : ""}">
          ${productImage(item, "inventory-image")}
          <div class="inventory-product">
            <div class="inventory-name-row">
              <div>
                <span class="pill">${item.game === "mtg" ? "MTG" : "Pokémon"} · ${escapeHtml(
                  item.productType
                )}</span>
                <h3>${escapeHtml(item.name)}</h3>
                <p>${escapeHtml(item.setName)}${item.number ? ` · #${escapeHtml(item.number)}` : ""}</p>
                <p class="variant">${escapeHtml(variantLabel(item.variant))} · ${escapeHtml(
                  item.sourceLabel
                )}</p>
              </div>
              <button class="icon-button delete-button" data-buy-delete="${id}" type="button" aria-label="Remove ${escapeHtml(
                item.name
              )}">×</button>
            </div>
            <div class="buy-metrics">
              <div>
                <span>Market</span>
                <strong>${formatCurrency(calculation.marketPrice)}</strong>
                ${priceChange(item)}
              </div>
              <label>
                <span>Condition</span>
                <select data-buy-condition="${id}">
                  ${conditionOptions(item.condition)}
                </select>
                <small>${calculation.conditionPercent}% · ${formatCurrency(
                  calculation.conditionedValue
                )}</small>
              </label>
              <label>
                <span>Buy %</span>
                <div class="percent-field compact-percent">
                  <input
                    data-buy-percent="${id}"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value="${escapeHtml(override)}"
                    placeholder="${state.buySession.defaultBuyPercent}"
                    aria-label="Buy percentage for ${escapeHtml(item.name)}"
                  />
                  <span>%</span>
                </div>
                <small>${override === "" ? "Transaction default" : "Card override"}</small>
              </label>
              <div class="offer-value">
                <span>Offer</span>
                <strong>${formatCurrency(calculation.offer)}</strong>
              </div>
            </div>
            <div class="inventory-meta">
              <span class="${item.priceError ? "error-text" : ""}">
                ${
                  item.priceError
                    ? escapeHtml(item.priceError)
                    : `Updated ${formatRelativeDate(item.updatedAt)}`
                }
              </span>
              <div>
                ${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">Source</a>` : ""}
                <button class="text-button" data-buy-refresh="${id}" type="button">Refresh</button>
              </div>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
  renderLocalSessions();
}

function renderLocalSessions() {
  elements.localSessionCount.textContent = state.buySessions.length.toLocaleString();
  elements.localSessionList.innerHTML = [...state.buySessions]
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .map((session) => {
      const summary = summarizeBuySession(
        session.items,
        session.defaultBuyPercent,
        state.settings.conditionPercentages
      );
      const id = escapeHtml(session.id);
      const active = session.id === state.buySession.id;
      return `
        <article class="local-session-item${active ? " active" : ""}">
          <div>
            <strong>${escapeHtml(buySessionLabel(session))}</strong>
            <span>${summary.cards} card${summary.cards === 1 ? "" : "s"} · ${formatCurrency(
              summary.offerTotal
            )} offer · ${formatRelativeDate(session.updatedAt)}</span>
          </div>
          <div class="local-session-actions">
            ${
              active
                ? '<span class="current-session">Current</span>'
                : `<button class="text-button" data-session-open="${id}" type="button">Open</button>`
            }
            <button class="text-button" data-session-duplicate="${id}" type="button">Copy</button>
            <button class="text-button danger-text" data-session-delete="${id}" type="button">Delete</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderView() {
  const buying = state.view === "buy";
  elements.inventorySummary.hidden = buying;
  elements.inventoryPanel.hidden = buying;
  elements.buySummary.hidden = !buying;
  elements.buyPanel.hidden = !buying;
  elements.searchEyebrow.textContent = buying ? "Build an offer" : "Add inventory";
  elements.searchTitle.textContent = buying ? "Add cards to this buy" : "Find a product";
  elements.refreshButtonLabel.textContent =
    state.view === "buy" ? "Refresh buy prices" : "Refresh all prices";
  for (const button of elements.viewButtons) {
    const active = button.dataset.view === state.view;
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  }
  renderSearchResults();
  renderInventory();
  renderBuySession();
}

function updateSearchHint() {
  const type = elements.productTypeSelect.value;
  const source = elements.sourceSelect.value;
  if (source === "pricecharting") {
    elements.searchHint.textContent =
      "PriceCharting requires a paid API token in Settings and may take several seconds.";
  } else if (type === "sealed") {
    elements.searchHint.textContent =
      "Include the set name and product, such as “Surging Sparks ETB”.";
  } else {
    elements.searchHint.textContent =
      "Search by card name. Choose the exact printing and finish from the results.";
  }
  const examples =
    elements.gameSelect.value === "mtg"
      ? type === "sealed"
        ? "Try “Modern Horizons 3 collector booster box”"
        : "Try “Lightning Bolt”"
      : type === "sealed"
        ? "Try “Surging Sparks ETB”"
        : "Try “Charizard ex”";
  elements.searchInput.placeholder = examples;
}

async function search(event) {
  event.preventDefault();
  const query = elements.searchInput.value.trim();
  if (query.length < 2) return;
  if (elements.sourceSelect.value === "pricecharting" && !state.settings.priceChartingToken) {
    elements.settingsPanel.open = true;
    elements.priceChartingToken.focus();
    showStatus("Add your PriceCharting API token in Settings first.", "error");
    return;
  }

  elements.searchButton.disabled = true;
  elements.searchButton.textContent = "Searching…";
  state.searchResults = [];
  renderSearchResults();
  showStatus(
    elements.sourceSelect.value === "pricecharting"
      ? "Searching PriceCharting and loading current prices…"
      : "Searching current market data…"
  );

  try {
    const url = new URL("/api/search", location.origin);
    url.searchParams.set("game", elements.gameSelect.value);
    url.searchParams.set("type", elements.productTypeSelect.value);
    url.searchParams.set("source", elements.sourceSelect.value);
    url.searchParams.set("q", query);
    const response = await fetch(url, {
      headers: state.settings.priceChartingToken
        ? { "X-PriceCharting-Token": state.settings.priceChartingToken }
        : {}
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Search failed.");
    state.searchResults = data.results || [];
    if (!state.searchResults.length) {
      showStatus("No priced products found. Try a broader name or another source.", "error");
    } else {
      hideStatus();
    }
    renderSearchResults();
  } catch (error) {
    showStatus(error.message, "error");
  } finally {
    elements.searchButton.disabled = false;
    elements.searchButton.textContent = "Search prices";
  }
}

function addResult(index) {
  const result = state.searchResults[index];
  if (!result) return;
  if (state.view === "buy") {
    state.buySession.items.unshift({
      ...result,
      buyItemId: crypto.randomUUID(),
      condition: "nearMint",
      buyPercent: "",
      previousPrice: null,
      addedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      priceError: ""
    });
    saveBuySession();
    renderBuySession();
    showStatus(`${result.name} added to this buy.`, "success");
    return;
  }
  const key = inventoryKey(result);
  const existing = state.inventory.find((item) => inventoryKey(item) === key);
  if (existing) {
    existing.quantity += 1;
  } else {
    state.inventory.unshift({
      ...result,
      quantity: 1,
      previousPrice: null,
      addedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      priceError: ""
    });
  }
  saveInventory();
  renderInventory();
  showStatus(`${result.name} added to inventory.`, "success");
}

function findInventoryItem(key) {
  return state.inventory.find((item) => inventoryKey(item) === key);
}

function findBuyItem(id) {
  return state.buySession.items.find((item) => item.buyItemId === id);
}

function updateQuantity(key, value) {
  const item = findInventoryItem(key);
  if (!item) return;
  item.quantity = Math.min(9999, Math.max(1, Number(value) || 1));
  saveInventory();
  renderInventory();
}

function priceUrl(item) {
  const url = new URL("/api/price", location.origin);
  url.searchParams.set("source", item.source);
  url.searchParams.set("id", item.sourceId);
  url.searchParams.set("variant", item.variant);
  if (item.categoryId) url.searchParams.set("categoryId", item.categoryId);
  if (item.groupId) url.searchParams.set("groupId", item.groupId);
  return url;
}

async function updateMarketPrice(item) {
  try {
    const response = await fetch(priceUrl(item), {
      headers: state.settings.priceChartingToken
        ? { "X-PriceCharting-Token": state.settings.priceChartingToken }
        : {}
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Refresh failed.");
    const marketPrice = normalizeMarketPrice(data.marketPrice);
    if (marketPrice === null) {
      throw new Error("No current market price.");
    }
    item.previousPrice = Number(item.marketPrice);
    item.marketPrice = marketPrice;
    item.sourceUpdatedAt = data.sourceUpdatedAt || item.sourceUpdatedAt;
    item.updatedAt = new Date().toISOString();
    item.priceError = "";
  } catch (error) {
    item.priceError = error.message;
  }
}

async function refreshInventoryItem(item) {
  await updateMarketPrice(item);
  saveInventory();
  renderInventory();
}

async function refreshBuyItem(item) {
  await updateMarketPrice(item);
  saveBuySession();
  renderBuySession();
}

async function runPool(items, concurrency, worker) {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      await worker(queue.shift());
    }
  });
  await Promise.all(runners);
}

async function refreshAll() {
  const buying = state.view === "buy";
  const items = buying ? state.buySession.items : state.inventory;
  if (!items.length || state.refreshing) return;
  state.refreshing = true;
  elements.refreshAllButton.disabled = true;
  const normal = items.filter((item) => item.source !== "pricecharting");
  const priceCharting = items.filter((item) => item.source === "pricecharting");
  let completed = 0;
  const total = items.length;
  const refresh = async (item) => {
    elements.refreshButtonLabel.textContent = `Refreshing ${completed + 1} of ${total}`;
    await updateMarketPrice(item);
    completed += 1;
    if (buying) {
      saveBuySession();
      renderBuySession();
    } else {
      saveInventory();
      renderInventory();
    }
  };

  await runPool(normal, 4, refresh);
  for (const item of priceCharting) {
    await refresh(item);
  }

  elements.refreshButtonLabel.textContent =
    state.view === "buy" ? "Refresh buy prices" : "Refresh all prices";
  elements.refreshAllButton.disabled = false;
  state.refreshing = false;
}

elements.searchForm.addEventListener("submit", search);
elements.searchResults.addEventListener("click", (event) => {
  const button = event.target.closest("[data-add-result]");
  if (button) addResult(Number(button.dataset.addResult));
});
elements.inventoryList.addEventListener("click", async (event) => {
  const quantityButton = event.target.closest("[data-quantity]");
  if (quantityButton) {
    const item = findInventoryItem(quantityButton.dataset.quantity);
    if (item) updateQuantity(quantityButton.dataset.quantity, item.quantity + Number(quantityButton.dataset.delta));
    return;
  }
  const deleteButton = event.target.closest("[data-delete]");
  if (deleteButton) {
    state.inventory = state.inventory.filter(
      (item) => inventoryKey(item) !== deleteButton.dataset.delete
    );
    saveInventory();
    renderInventory();
    return;
  }
  const refreshButton = event.target.closest("[data-refresh]");
  if (refreshButton) {
    const item = findInventoryItem(refreshButton.dataset.refresh);
    if (item) {
      refreshButton.disabled = true;
      refreshButton.textContent = "Refreshing…";
      await refreshInventoryItem(item);
    }
  }
});
elements.inventoryList.addEventListener("change", (event) => {
  if (event.target.matches("[data-quantity-input]")) {
    updateQuantity(event.target.dataset.quantityInput, event.target.value);
  }
});
elements.refreshAllButton.addEventListener("click", refreshAll);
elements.inventoryFilter.addEventListener("input", renderInventory);
elements.inventorySort.addEventListener("change", renderInventory);
elements.buyList.addEventListener("click", async (event) => {
  const deleteButton = event.target.closest("[data-buy-delete]");
  if (deleteButton) {
    state.buySession.items = state.buySession.items.filter(
      (item) => item.buyItemId !== deleteButton.dataset.buyDelete
    );
    saveBuySession();
    renderBuySession();
    return;
  }
  const refreshButton = event.target.closest("[data-buy-refresh]");
  if (refreshButton) {
    const item = findBuyItem(refreshButton.dataset.buyRefresh);
    if (item) {
      refreshButton.disabled = true;
      refreshButton.textContent = "Refreshing…";
      await refreshBuyItem(item);
    }
  }
});
elements.buyList.addEventListener("change", (event) => {
  const conditionSelect = event.target.closest("[data-buy-condition]");
  if (conditionSelect) {
    const item = findBuyItem(conditionSelect.dataset.buyCondition);
    if (item) {
      item.condition = conditionSelect.value;
      saveBuySession();
      renderBuySession();
    }
    return;
  }
  const buyPercentInput = event.target.closest("[data-buy-percent]");
  if (buyPercentInput) {
    const item = findBuyItem(buyPercentInput.dataset.buyPercent);
    if (item) {
      item.buyPercent =
        buyPercentInput.value === "" ? "" : normalizePercentage(buyPercentInput.value);
      saveBuySession();
      renderBuySession();
    }
  }
});
elements.defaultBuyPercent.addEventListener("change", () => {
  state.buySession.defaultBuyPercent = normalizePercentage(elements.defaultBuyPercent.value, 70);
  elements.defaultBuyPercent.value = state.buySession.defaultBuyPercent;
  saveBuySession();
  renderBuySession();
});
elements.buySessionName.addEventListener("input", () => {
  state.buySession.name = elements.buySessionName.value;
  saveBuySession();
});
elements.buySessionName.addEventListener("change", renderLocalSessions);
elements.newBuySessionButton.addEventListener("click", () => {
  const session = createBuySession();
  state.buySessions.unshift(session);
  state.buySession = session;
  elements.defaultBuyPercent.value = session.defaultBuyPercent;
  state.searchResults = [];
  renderSearchResults();
  hideStatus();
  saveBuySession();
  renderBuySession();
  elements.buySessionName.focus();
});
elements.localSessionList.addEventListener("click", (event) => {
  const openButton = event.target.closest("[data-session-open]");
  if (openButton) {
    const session = state.buySessions.find((item) => item.id === openButton.dataset.sessionOpen);
    if (!session) return;
    state.buySession = session;
    elements.defaultBuyPercent.value = session.defaultBuyPercent;
    state.searchResults = [];
    saveBuySession(false);
    renderSearchResults();
    hideStatus();
    renderBuySession();
    return;
  }
  const duplicateButton = event.target.closest("[data-session-duplicate]");
  if (duplicateButton) {
    const source = state.buySessions.find(
      (item) => item.id === duplicateButton.dataset.sessionDuplicate
    );
    if (!source) return;
    const session = createBuySession(`${buySessionLabel(source)} copy`);
    session.defaultBuyPercent = source.defaultBuyPercent;
    session.items = source.items.map((item) => ({
      ...item,
      buyItemId: crypto.randomUUID()
    }));
    state.buySessions.unshift(session);
    state.buySession = session;
    elements.defaultBuyPercent.value = session.defaultBuyPercent;
    state.searchResults = [];
    saveBuySession();
    renderSearchResults();
    hideStatus();
    renderBuySession();
    return;
  }
  const deleteButton = event.target.closest("[data-session-delete]");
  if (!deleteButton) return;
  const session = state.buySessions.find(
    (item) => item.id === deleteButton.dataset.sessionDelete
  );
  if (!session || !window.confirm(`Delete "${buySessionLabel(session)}" from this browser?`)) {
    return;
  }
  state.buySessions = state.buySessions.filter((item) => item.id !== session.id);
  if (!state.buySessions.length) {
    state.buySessions = [createBuySession()];
  }
  if (state.buySession.id === session.id) {
    state.buySession = state.buySessions[0];
    elements.defaultBuyPercent.value = state.buySession.defaultBuyPercent;
  }
  saveBuySession(false);
  renderBuySession();
});
elements.saveConditionSettingsButton.addEventListener("click", () => {
  for (const input of elements.conditionSettings) {
    const condition = input.dataset.conditionSetting;
    state.settings.conditionPercentages[condition] = normalizePercentage(
      input.value,
      DEFAULT_CONDITION_PERCENTAGES[condition]
    );
    input.value = state.settings.conditionPercentages[condition];
  }
  saveSettings();
  document.querySelector("#buySettingsPanel").open = false;
  renderBuySession();
  showStatus("Condition values saved in this browser.", "success");
});
for (const button of elements.viewButtons) {
  button.addEventListener("click", () => {
    location.hash = button.dataset.view === "buy" ? "buy" : "inventory";
  });
}
window.addEventListener("hashchange", () => {
  state.view = location.hash === "#buy" ? "buy" : "inventory";
  state.searchResults = [];
  hideStatus();
  renderView();
});
[elements.gameSelect, elements.productTypeSelect, elements.sourceSelect].forEach((element) =>
  element.addEventListener("change", updateSearchHint)
);
elements.saveSettingsButton.addEventListener("click", () => {
  saveSettings();
  elements.settingsPanel.open = false;
  showStatus("Settings saved in this browser.", "success");
});
elements.exportCsvButton.addEventListener("click", () => {
  if (!state.inventory.length) return;
  download(
    `card-show-inventory-${new Date().toISOString().slice(0, 10)}.csv`,
    inventoryToCsv(state.inventory),
    "text/csv;charset=utf-8"
  );
});
elements.backupButton.addEventListener("click", downloadBackup);
elements.buyBackupButton.addEventListener("click", downloadBackup);
elements.restoreInput.addEventListener("change", async () => {
  const file = elements.restoreInput.files?.[0];
  if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    if (!Array.isArray(backup.inventory) && !Array.isArray(backup.buySessions?.sessions)) {
      throw new Error("That file is not a card show backup.");
    }
    if (Array.isArray(backup.inventory)) {
      state.inventory = backup.inventory;
    }
    if (Array.isArray(backup.buySessions?.sessions)) {
      const restoredStore = normalizeBuySessionStore(
        backup.buySessions,
        null,
        () => crypto.randomUUID()
      );
      state.buySessions = restoredStore.sessions;
      state.buySession =
        state.buySessions.find((session) => session.id === restoredStore.activeSessionId) ||
        state.buySessions[0];
      elements.defaultBuyPercent.value = state.buySession.defaultBuyPercent;
      saveBuySession(false);
    }
    if (backup.conditionPercentages && typeof backup.conditionPercentages === "object") {
      state.settings.conditionPercentages = Object.fromEntries(
        CONDITIONS.map(([condition]) => [
          condition,
          normalizePercentage(
            backup.conditionPercentages[condition],
            DEFAULT_CONDITION_PERCENTAGES[condition]
          )
        ])
      );
      for (const input of elements.conditionSettings) {
        input.value = state.settings.conditionPercentages[input.dataset.conditionSetting];
      }
      saveSettings();
    }
    saveInventory();
    renderView();
    showStatus(
      Array.isArray(backup.buySessions?.sessions)
        ? "Inventory and local buy sessions restored."
        : `${state.inventory.length} products restored.`,
      "success"
    );
  } catch (error) {
    showStatus(error.message, "error");
  } finally {
    elements.restoreInput.value = "";
  }
});

function updateOnlineStatus() {
  elements.onlineStatus.textContent = navigator.onLine ? "Online" : "Offline · inventory still available";
  elements.onlineStatus.classList.toggle("offline", !navigator.onLine);
}

window.addEventListener("online", updateOnlineStatus);
window.addEventListener("offline", updateOnlineStatus);
updateOnlineStatus();
updateSearchHint();
renderView();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => undefined);
}
