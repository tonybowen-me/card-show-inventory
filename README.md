# Card Show Inventory

An intentionally small, local-first inventory app for Magic: The Gathering and Pokémon singles and sealed products.

## What it does

- Searches TCGplayer-backed prices for singles and sealed products.
- Optionally searches PriceCharting with a paid PriceCharting API token.
- Adds products to a browser-local inventory with quantity tracking.
- Refreshes the entire inventory's market prices with one button.
- Builds a seller buy session with condition adjustments and configurable offer percentages.
- Exports CSV and JSON backups.
- Installs as a lightweight PWA; inventory remains available offline.

Inventory, the current buy session, and API settings are stored only in the current browser. There is no account, database, or analytics.

## Buy sessions

Open **Buy Session**, search for each card, and select **Add to buy**. Each physical card is kept as a separate line so duplicate cards can have different conditions or offers.

- Set a transaction buy percentage to price the whole stack.
- Optionally enter a different buy percentage on any individual card.
- Choose Near Mint, Lightly Played, Moderately Played, Heavily Played, or Damaged.
- Edit the condition percentages from **Condition values**.
- See market value, condition-adjusted value, and the cash offer per card and for the full transaction.
- Refresh one card or every card in the session without losing the current offer settings.

The offer is `market price × condition percentage × buy percentage`. The current session is saved in local browser storage until **New session** is selected.

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
