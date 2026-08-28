import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  isSealedProduct,
  normalizeMarketPrice,
  pickMarketPrice,
  priceChartingPrice,
  rankGroups,
  scoreProduct
} from "./server-lib.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, "public");
const PORT = Number(process.env.PORT || 3000);
const CACHE = new Map();
const CACHE_TTL = 15 * 60 * 1000;
const GROUP_CACHE_TTL = 6 * 60 * 60 * 1000;
const CATEGORY_IDS = { mtg: 1, pokemon: 3 };
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

let priceChartingQueue = Promise.resolve();
let lastPriceChartingCall = 0;

function json(response, status, body) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body));
}

function publicError(error) {
  if (error instanceof RequestError) {
    return { status: error.status, message: error.message };
  }
  console.error(error);
  return { status: 500, message: "The price source could not be reached. Try again." };
}

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      "User-Agent": "CardShowInventory/1.0",
      ...options.headers
    },
    signal: AbortSignal.timeout(20_000)
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data?.details?.[0]?.message ||
      data?.["error-message"] ||
      data?.error ||
      `Price source returned ${response.status}.`;
    throw new RequestError(response.status, message);
  }
  return data;
}

async function cachedJson(url, ttl = CACHE_TTL) {
  const cached = CACHE.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const value = await fetchJson(url);
  CACHE.set(url, { value, expiresAt: Date.now() + ttl });
  return value;
}

function priceChartingRequest(url) {
  const request = priceChartingQueue
    .catch(() => undefined)
    .then(async () => {
      const waitFor = Math.max(0, 1_050 - (Date.now() - lastPriceChartingCall));
      if (waitFor) {
        await new Promise((resolve) => setTimeout(resolve, waitFor));
      }
      try {
        return await fetchJson(url);
      } finally {
        lastPriceChartingCall = Date.now();
      }
    });

  priceChartingQueue = request.then(
    () => undefined,
    () => undefined
  );
  return request;
}

function requireParam(url, name) {
  const value = url.searchParams.get(name)?.trim();
  if (!value) {
    throw new RequestError(400, `Missing ${name}.`);
  }
  return value;
}

function validateGame(game) {
  if (!CATEGORY_IDS[game]) {
    throw new RequestError(400, "Game must be mtg or pokemon.");
  }
}

function mapScryfallCard(card) {
  const image = card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || "";
  const variants = [
    ["Normal", "usd"],
    ["Foil", "usd_foil"],
    ["Etched", "usd_etched"]
  ];

  return variants.flatMap(([variant, key]) => {
    const marketPrice = normalizeMarketPrice(card.prices?.[key]);
    return marketPrice === null
      ? []
      : [
          {
            source: "scryfall",
            sourceLabel: "TCGplayer",
            sourceId: card.id,
            game: "mtg",
            productType: "single",
            name: card.name,
            setName: card.set_name,
            number: card.collector_number,
            variant,
            marketPrice,
            image,
            externalUrl: card.purchase_uris?.tcgplayer || card.scryfall_uri,
            sourceUpdatedAt: null
          }
        ];
  });
}

async function searchMtgSingles(query) {
  const scryfallQuery = `name:"${query.replaceAll('"', "")}" game:paper`;
  const url = new URL("https://api.scryfall.com/cards/search");
  url.searchParams.set("q", scryfallQuery);
  url.searchParams.set("unique", "prints");
  url.searchParams.set("order", "released");
  url.searchParams.set("dir", "desc");

  const data = await fetchJson(url);
  return data.data.flatMap(mapScryfallCard).slice(0, 36);
}

function mapPokemonCard(card) {
  return Object.entries(card.tcgplayer?.prices || {}).flatMap(([variant, price]) => {
    const marketPrice = normalizeMarketPrice(price.market);
    return marketPrice === null
      ? []
      : [
          {
            source: "pokemontcg",
            sourceLabel: "TCGplayer",
            sourceId: card.id,
            game: "pokemon",
            productType: "single",
            name: card.name,
            setName: card.set?.name || "",
            number: card.number || "",
            variant,
            marketPrice,
            image: card.images?.small || "",
            externalUrl: card.tcgplayer?.url || "",
            sourceUpdatedAt: card.tcgplayer?.updatedAt || null
          }
        ];
  });
}

async function searchPokemonSingles(query) {
  const url = new URL("https://api.pokemontcg.io/v2/cards");
  url.searchParams.set("q", `name:"${query.replaceAll('"', "")}"`);
  url.searchParams.set("pageSize", "40");
  url.searchParams.set("select", "id,name,number,set,images,tcgplayer");

  const data = await fetchJson(url);
  return data.data.flatMap(mapPokemonCard).slice(0, 36);
}

async function tcgCsvGroups(categoryId) {
  const data = await cachedJson(
    `https://tcgcsv.com/tcgplayer/${categoryId}/groups`,
    GROUP_CACHE_TTL
  );
  return data.results || [];
}

async function tcgCsvGroupData(categoryId, groupId) {
  const base = `https://tcgcsv.com/tcgplayer/${categoryId}/${groupId}`;
  const [products, prices] = await Promise.all([
    cachedJson(`${base}/products`),
    cachedJson(`${base}/prices`)
  ]);
  return { products: products.results || [], prices: prices.results || [] };
}

async function searchSealed(game, query) {
  const categoryId = CATEGORY_IDS[game];
  const groups = rankGroups(await tcgCsvGroups(categoryId), query);
  if (!groups.length) {
    throw new RequestError(
      404,
      "No matching set found. Include the set name, such as “Surging Sparks ETB” or “Modern Horizons 3 booster box”."
    );
  }

  const groupData = await Promise.all(
    groups.map(async (group) => ({ group, ...(await tcgCsvGroupData(categoryId, group.groupId)) }))
  );

  return groupData
    .flatMap(({ group, products, prices }) =>
      products
        .filter(isSealedProduct)
        .map((product) => {
          const price = pickMarketPrice(prices, product.productId);
          return {
            score: scoreProduct(product, query) + group.score,
            source: "tcgcsv",
            sourceLabel: "TCGplayer",
            sourceId: String(product.productId),
            groupId: String(group.groupId),
            categoryId: String(categoryId),
            game,
            productType: "sealed",
            name: product.name,
            setName: group.name,
            number: "",
            variant: price?.subTypeName || "Sealed",
            marketPrice: price?.marketPrice ?? null,
            image: product.imageUrl || "",
            externalUrl: product.url || "",
            sourceUpdatedAt: product.modifiedOn || null
          };
        })
    )
    .filter((product) => product.score > 0 && product.marketPrice !== null)
    .sort((a, b) => b.score - a.score || (b.marketPrice || 0) - (a.marketPrice || 0))
    .slice(0, 36)
    .map(({ score, ...product }) => product);
}

function priceChartingToken(request) {
  const token = request.headers["x-pricecharting-token"]?.trim();
  if (!token) {
    throw new RequestError(401, "Add your PriceCharting API token in Settings first.");
  }
  if (!/^[a-zA-Z0-9]{20,80}$/.test(token)) {
    throw new RequestError(400, "The PriceCharting API token format is invalid.");
  }
  return token;
}

function mapPriceChartingProduct(product, game, productType) {
  return {
    source: "pricecharting",
    sourceLabel: "PriceCharting",
    sourceId: String(product.id),
    game,
    productType,
    name: product["product-name"],
    setName: product["console-name"] || "",
    number: "",
    variant: "Ungraded / market",
    marketPrice: priceChartingPrice(product),
    image: "",
    externalUrl: `https://www.pricecharting.com/search-products?type=prices&q=${encodeURIComponent(
      product["product-name"]
    )}`,
    sourceUpdatedAt: null
  };
}

async function searchPriceCharting(request, game, productType, query) {
  const token = priceChartingToken(request);
  const gameName = game === "mtg" ? "magic" : "pokemon";
  const searchUrl = new URL("https://www.pricecharting.com/api/products");
  searchUrl.searchParams.set("t", token);
  searchUrl.searchParams.set("q", `${gameName} ${query}`);
  const search = await priceChartingRequest(searchUrl);
  if (search.status === "error") {
    throw new RequestError(502, search["error-message"] || "PriceCharting search failed.");
  }

  const candidates = (search.products || [])
    .filter((product) => {
      const consoleName = String(product["console-name"] || "").toLowerCase();
      return game === "mtg" ? consoleName.includes("magic") : consoleName.includes("pokemon");
    })
    .slice(0, 8);

  const detailed = [];
  for (const candidate of candidates) {
    const detailUrl = new URL("https://www.pricecharting.com/api/product");
    detailUrl.searchParams.set("t", token);
    detailUrl.searchParams.set("id", candidate.id);
    const detail = await priceChartingRequest(detailUrl);
    if (detail.status === "success") {
      detailed.push(mapPriceChartingProduct(detail, game, productType));
    }
  }
  return detailed;
}

async function refreshPrice(request, url) {
  const source = requireParam(url, "source");
  const id = requireParam(url, "id");
  const variant = url.searchParams.get("variant") || "";

  if (source === "scryfall") {
    const card = await fetchJson(`https://api.scryfall.com/cards/${encodeURIComponent(id)}`);
    const key = { Normal: "usd", Foil: "usd_foil", Etched: "usd_etched" }[variant];
    const marketPrice = normalizeMarketPrice(card.prices?.[key]);
    return {
      marketPrice,
      sourceUpdatedAt: null
    };
  }

  if (source === "pokemontcg") {
    const card = await fetchJson(
      `https://api.pokemontcg.io/v2/cards/${encodeURIComponent(id)}?select=id,tcgplayer`
    );
    return {
      marketPrice: normalizeMarketPrice(card.data?.tcgplayer?.prices?.[variant]?.market),
      sourceUpdatedAt: card.data?.tcgplayer?.updatedAt || null
    };
  }

  if (source === "tcgcsv") {
    const categoryId = requireParam(url, "categoryId");
    const groupId = requireParam(url, "groupId");
    const { prices } = await tcgCsvGroupData(categoryId, groupId);
    const price = pickMarketPrice(prices, id);
    return {
      marketPrice: price?.marketPrice ?? null,
      sourceUpdatedAt: null
    };
  }

  if (source === "pricecharting") {
    const token = priceChartingToken(request);
    const detailUrl = new URL("https://www.pricecharting.com/api/product");
    detailUrl.searchParams.set("t", token);
    detailUrl.searchParams.set("id", id);
    const detail = await priceChartingRequest(detailUrl);
    return { marketPrice: priceChartingPrice(detail), sourceUpdatedAt: null };
  }

  throw new RequestError(400, "Unknown price source.");
}

async function handleApi(request, response, url) {
  if (request.method !== "GET") {
    throw new RequestError(405, "Method not allowed.");
  }

  if (url.pathname === "/api/health") {
    return json(response, 200, { ok: true });
  }

  if (url.pathname === "/api/search") {
    const game = requireParam(url, "game");
    const productType = requireParam(url, "type");
    const source = requireParam(url, "source");
    const query = requireParam(url, "q");
    validateGame(game);
    if (!["single", "sealed"].includes(productType)) {
      throw new RequestError(400, "Type must be single or sealed.");
    }
    if (query.length < 2 || query.length > 100) {
      throw new RequestError(400, "Search must be between 2 and 100 characters.");
    }

    let results;
    if (source === "pricecharting") {
      results = await searchPriceCharting(request, game, productType, query);
    } else if (source === "tcgplayer" && productType === "sealed") {
      results = await searchSealed(game, query);
    } else if (source === "tcgplayer" && game === "mtg") {
      results = await searchMtgSingles(query);
    } else if (source === "tcgplayer") {
      results = await searchPokemonSingles(query);
    } else {
      throw new RequestError(400, "Source must be tcgplayer or pricecharting.");
    }

    return json(response, 200, { results });
  }

  if (url.pathname === "/api/price") {
    return json(response, 200, await refreshPrice(request, url));
  }

  throw new RequestError(404, "Not found.");
}

async function serveStatic(response, pathname) {
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = path.resolve(PUBLIC_DIR, requested);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`) && filePath !== path.join(PUBLIC_DIR, "index.html")) {
    throw new RequestError(404, "Not found.");
  }

  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat?.isFile()) {
    throw new RequestError(404, "Not found.");
  }

  const extension = path.extname(filePath);
  response.writeHead(200, {
    "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=3600",
    "Content-Length": fileStat.size,
    "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
    "X-Content-Type-Options": "nosniff"
  });
  createReadStream(filePath).pipe(response);
}

export function startServer(port = PORT) {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
      if (url.pathname.startsWith("/api/")) {
        await handleApi(request, response, url);
      } else {
        await serveStatic(response, url.pathname);
      }
    } catch (error) {
      const { status, message } = publicError(error);
      json(response, status, { error: message });
    }
  });

  server.listen(port, () => {
    console.log(`Card Show Inventory running at http://localhost:${port}`);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
