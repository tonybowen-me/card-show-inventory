import {
  escapeHtml,
  formatCurrency,
  formatRelativeDate,
  inventoryKey,
  inventoryToCsv,
  summarizeInventory
} from "./lib.js";

const STORAGE_KEY = "card-show-inventory:v1";
const SETTINGS_KEY = "card-show-inventory:settings:v1";

const elements = {
  backupButton: document.querySelector("#backupButton"),
  emptyState: document.querySelector("#emptyState"),
  exportCsvButton: document.querySelector("#exportCsvButton"),
  gameSelect: document.querySelector("#gameSelect"),
  inventoryFilter: document.querySelector("#inventoryFilter"),
  inventoryList: document.querySelector("#inventoryList"),
  inventorySort: document.querySelector("#inventorySort"),
  lastRefresh: document.querySelector("#lastRefresh"),
  marketValue: document.querySelector("#marketValue"),
  onlineStatus: document.querySelector("#onlineStatus"),
  priceChartingToken: document.querySelector("#priceChartingToken"),
  productCount: document.querySelector("#productCount"),
  productTypeSelect: document.querySelector("#productTypeSelect"),
  refreshAllButton: document.querySelector("#refreshAllButton"),
  refreshButtonLabel: document.querySelector("#refreshButtonLabel"),
  restoreInput: document.querySelector("#restoreInput"),
  saveSettingsButton: document.querySelector("#saveSettingsButton"),
  searchButton: document.querySelector("#searchButton"),
  searchForm: document.querySelector("#searchForm"),
  searchHint: document.querySelector("#searchHint"),
  searchInput: document.querySelector("#searchInput"),
  searchResults: document.querySelector("#searchResults"),
  searchStatus: document.querySelector("#searchStatus"),
  settingsPanel: document.querySelector("#settingsPanel"),
  sourceSelect: document.querySelector("#sourceSelect"),
  unitCount: document.querySelector("#unitCount")
};

const state = {
  inventory: readJson(STORAGE_KEY, []),
  settings: readJson(SETTINGS_KEY, { priceChartingToken: "" }),
  searchResults: [],
  refreshing: false
};

elements.priceChartingToken.value = state.settings.priceChartingToken || "";

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
                  <button class="primary compact" data-add-result="${index}" type="button">Add</button>
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

async function refreshItem(item, render = true) {
  try {
    const response = await fetch(priceUrl(item), {
      headers: state.settings.priceChartingToken
        ? { "X-PriceCharting-Token": state.settings.priceChartingToken }
        : {}
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Refresh failed.");
    if (!Number.isFinite(Number(data.marketPrice))) {
      throw new Error("No current market price.");
    }
    item.previousPrice = Number(item.marketPrice);
    item.marketPrice = Number(data.marketPrice);
    item.sourceUpdatedAt = data.sourceUpdatedAt || item.sourceUpdatedAt;
    item.updatedAt = new Date().toISOString();
    item.priceError = "";
  } catch (error) {
    item.priceError = error.message;
  }
  saveInventory();
  if (render) renderInventory();
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
  if (!state.inventory.length || state.refreshing) return;
  state.refreshing = true;
  elements.refreshAllButton.disabled = true;
  const normal = state.inventory.filter((item) => item.source !== "pricecharting");
  const priceCharting = state.inventory.filter((item) => item.source === "pricecharting");
  let completed = 0;
  const total = state.inventory.length;
  const refresh = async (item) => {
    elements.refreshButtonLabel.textContent = `Refreshing ${completed + 1} of ${total}`;
    await refreshItem(item, false);
    completed += 1;
    renderInventory();
  };

  await runPool(normal, 4, refresh);
  for (const item of priceCharting) {
    await refresh(item);
  }

  elements.refreshButtonLabel.textContent = "Refresh all prices";
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
      await refreshItem(item);
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
elements.backupButton.addEventListener("click", () => {
  download(
    `card-show-inventory-backup-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), inventory: state.inventory }, null, 2),
    "application/json"
  );
});
elements.restoreInput.addEventListener("change", async () => {
  const file = elements.restoreInput.files?.[0];
  if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    if (!Array.isArray(backup.inventory)) throw new Error("That file is not an inventory backup.");
    state.inventory = backup.inventory;
    saveInventory();
    renderInventory();
    showStatus(`${state.inventory.length} products restored.`, "success");
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
renderInventory();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => undefined);
}
