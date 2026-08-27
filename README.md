# Card Show Inventory

An intentionally small, local-first inventory app for Magic: The Gathering and Pokémon singles and sealed products.

## What it does

- Searches TCGplayer-backed prices for singles and sealed products.
- Optionally searches PriceCharting with a paid PriceCharting API token.
- Adds products to a browser-local inventory with quantity tracking.
- Refreshes the entire inventory's market prices with one button.
- Exports CSV and JSON backups.
- Installs as a lightweight PWA; inventory remains available offline.

Inventory and API settings are stored only in the current browser. There is no account, database, or analytics.

## Pricing sources

- **MTG singles:** TCGplayer-linked daily prices from Scryfall.
- **Pokémon singles:** TCGplayer market prices from the Pokémon TCG API.
- **MTG and Pokémon sealed:** TCGplayer catalog and market prices from TCGCSV.
- **Optional:** PriceCharting's paid Prices API. Its token is saved only in browser storage and sent with requests, not stored by the server.

TCGplayer is not currently issuing new direct API developer keys, so the app uses public, TCGplayer-backed datasets instead of requiring unavailable credentials.

## Run locally

Requires Node.js 20 or newer.

```bash
npm start
```

Open <http://localhost:3000>.

Optional environment variables:

```bash
PORT=8080 npm start
```

No package installation or build step is required.

## Checks

```bash
npm run lint
npm test
```

## PriceCharting

PriceCharting API access requires a paid subscription. Open **Settings** in the app and paste the 40-character API token from PriceCharting's Subscription → API/Download page. The app respects PriceCharting's one-request-per-second API limit.

## Deployment

Run `node server.mjs` on any Node-capable host. The service is stateless and needs no persistent disk; inventory lives in each browser.
