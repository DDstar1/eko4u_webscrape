# Eko4u Workshop CSV Exporter

Chrome extension (Manifest V3) that intercepts the last `POST` request to
`configurator.workshop` on eko4u.com and lets you export the request payload
and the price response as a CSV.

## Loading the extension (unpacked)

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `eko4u-csv-extension` folder.
4. Pin the extension (puzzle-piece icon → pin) so the popup is easy to reach.

## Triggering a capture

1. Go to `https://eko4u.com/?p=configurator` and open any product configurator.
2. Change a value (width, height, color, etc.) so the page POSTs to
   `?p=configurator.workshop` to refresh the price/drawing.
3. Click the extension icon. The popup shows:
   - A **price banner** with `PRICE`, `SELL_PRICE`, and `UW` from the response.
   - A CSV preview in the textarea below.
4. Click **🔄 Refresh** any time you want to pull the latest captured request.

## CSV output format

The textarea contains two sections, each formatted as `PATH,VALUE` rows
(matching the request CSVs used elsewhere in this project):

```
# PRICE SUMMARY
PATH,VALUE
PRICE,76.19 €
UW,1.100

# REQUEST PAYLOAD
PATH,VALUE
WORKSHOP[CONFIGS][CONFIG][0][WIDTH],500
WORKSHOP[CONFIGS][CONFIG][0][HEIGHT],500
...
```

- **PRICE SUMMARY** — `PRICE`, `SELL_PRICE`, `UW`, `PRODUCT` (`details_info`),
  and `ERROR_CODE`/`ERROR_MESSAGE` if present, pulled straight from the
  response JSON.
- **REQUEST PAYLOAD** — every form field sent in the POST body, flattened to
  dot-notation if nested.

Use **📋 Copy CSV** to copy the text, or **⬇ Download CSV** to save it as
`eko4u-workshop-<timestamp>.csv`.

## Notes

- The interceptor patches `window.fetch` and `XMLHttpRequest` in the page's
  main world, so it only sees traffic from tabs on `https://eko4u.com/*`.
- Always confirm the captured `PRICE` matches what's shown in the
  configurator UI before relying on the exported CSV.
