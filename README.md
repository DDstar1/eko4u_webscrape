# eko4u_webscrape

Tools for pulling window/door prices off the [eko4u.com](https://eko4u.com) configurator
(`?p=configurator.workshop`) for different window systems, opening types, and peripheral
profiles, across a grid of widths/heights, and exporting the results as CSV.

The project has three parts:

1. **Python scrapers** (`1_Einflugelig/`) — replay captured configurator requests for every
   width/height combo and record the returned price.
2. **CSV request/output files** — the actual payloads sent to eko4u and the prices scraped
   back, organized by product/system/profile.
3. **`eko4u-csv-extension/`** — a Chrome extension used to *capture* new request payloads
   and price responses from the live configurator, so they can be dropped into the CSVs
   the scrapers read.

`2_Zweiflugelige/` (two-sash) and `3_Dreflugelige/` (three-sash) are placeholders for the
same workflow applied to those window types — not yet implemented.

## Directory layout

```
eko4u/
├── all_dimensions.csv              # master width,height grid scraped for every product
├── headers.csv                     # HTTP headers used for scraper requests (gitignored, see below)
├── 1_Einflugelig/                  # single-sash ("Einflügelig") window scraping
│   ├── lookup.py                   # SYSTEMS/ITEMS code maps + per-system zustaprofile catalogs
│   ├── scraper.py                  # scrapes price by (item, system) across all_dimensions.csv
│   ├── zustaprofile_scraper.py     # scrapes price by (system, position, peripheral profile)
│   ├── requests/
│   │   ├── *.csv                   # base request payloads, named "<item>---<system>.csv"
│   │   ├── profiles/               # base "fix" payloads per system, named "fix---<system>.csv"
│   │   └── zustaprofile/           # peripheral-profile payload fragments, named "<code_name>.csv"
│   └── excel_outputs/
│       ├── *---output.csv          # scraped width,height,price grids per item/system
│       ├── profiles/               # scraped grids per profiles/*.csv input
│       └── zustaprofile/           # scraped grids per system/position/profile combo
├── 2_Zweiflugelige/                 # (empty — two-sash, not yet built)
├── 3_Dreflugelige/                  # (empty — three-sash, not yet built)
└── eko4u-csv-extension/            # Chrome extension for capturing new payloads
```

## CSV files

CSV is the data format this whole project runs on — every input and output is a CSV, and
none of it is generated/derivable from anything else, so it's all worth keeping straight:

| File | Format | Purpose |
|---|---|---|
| `all_dimensions.csv` | `width,height` | Master grid of dimensions (mm) that every item/system combo gets priced at. |
| `headers.csv` | `PATH,VALUE` | Raw HTTP request headers (User-Agent, cookies-adjacent headers, etc.) replayed on every scrape request. **Not committed to git** — see below. |
| `1_Einflugelig/requests/*.csv` | `PATH,VALUE` | Captured form payload for one `(item, system)` combo, e.g. `fix---be82.csv`. `scraper.py` swaps in width/height per row of `all_dimensions.csv`. |
| `1_Einflugelig/requests/profiles/*.csv` | `PATH,VALUE` | Base "fix" payload per system, used as the template that peripheral profiles get spliced into. |
| `1_Einflugelig/requests/zustaprofile/*.csv` | `PATH,VALUE` | Payload fragment for one peripheral/"Zustaprofil" add-on (e.g. `SL_NP0360.csv`), spliced into a base profile payload at a given position. |
| `1_Einflugelig/excel_outputs/**/*---output.csv` | `width,height,price` | Scrape results — one row per dimension, one file per item/system or per system/position/profile combo. |

`headers.csv` is listed in `.gitignore` (along with `headers.py` and `*.lock`) because it
can carry session-specific or fingerprintable request headers — keep your own local copy;
`scraper.py` and `zustaprofile_scraper.py` both expect it at the repo root next to
`all_dimensions.csv`. All other CSVs (dimensions, requests, outputs) **are** tracked in git
and are safe/expected to commit.

## Running the scrapers

From `1_Einflugelig/`:

```bash
python scraper.py
```

Lists every `requests/*.csv` file that doesn't already have a matching output, lets you pick
which ones to run (comma-separated indices or `all`), then for each one walks every
`width,height` row in `../all_dimensions.csv`, POSTs to the configurator, parses the
returned price, and writes `excel_outputs/<name>---output.csv`.

```bash
python zustaprofile_scraper.py
```

Same idea, but for peripheral profiles ("Zustaprofile"): it combines a base `fix` payload
(`requests/profiles/fix---<system>.csv`) with a peripheral profile fragment
(`requests/zustaprofile/<code_name>.csv`) at a chosen position (`oben`/`unten`/`links`/`rechts`),
for every `(system, position, profile)` combination defined in `lookup.py`, and writes results
to `excel_outputs/zustaprofile/`.

Both scripts skip combos that already have an output file, retry on network errors, and pace
requests with a short delay (`REQUEST_DELAY_SECONDS`) to avoid hammering the site.

## Capturing new request payloads

To scrape a new item/system/profile, you first need its request payload as a CSV. Use the
Chrome extension in `eko4u-csv-extension/`:

1. Load it unpacked via `chrome://extensions` (Developer mode → Load unpacked).
2. Open a configurator on eko4u.com and change a value so it POSTs to
   `?p=configurator.workshop`.
3. Click the extension icon — it shows the price and a `PATH,VALUE` CSV preview of the
   request payload.
4. Copy/download the **REQUEST PAYLOAD** section and save it under the matching
   `requests/` subfolder, named to match the existing convention
   (e.g. `fix---be82.csv`, or a `code_name` like `SL_NP0360.csv`).

See `eko4u-csv-extension/README.md` for full details on the capture format.

## Adding a new system or peripheral profile

1. Add the system/item code mapping to `SYSTEMS`/`ITEMS` in `lookup.py`.
2. Capture and save the base request CSV under `requests/` (or `requests/profiles/` for a
   `fix` base payload).
3. For peripheral profiles, add the profile's `code_name`/`title` to the relevant
   `*_ZUSTAPROFILES` dict in `lookup.py` and save its payload fragment under
   `requests/zustaprofile/<code_name>.csv`.
4. Re-run the relevant scraper — it will pick up the new combo automatically.

## `lookup.py` reference

`1_Einflugelig/lookup.py` (345 lines) is pure data — no functions, just dicts that the two
scrapers import.

- **`SYSTEMS`** — maps the eko4u internal system code (e.g. `"23_BE82"`) to the short slug
  used in filenames (`"be82"`). Four systems currently: `be82`, `be92`, `ge76_2d`, `ge76_3d`.
- **`ITEMS`** — maps the eko4u internal opening-type label (e.g. `"UCHYL"`) to the short slug
  used in filenames. Four items: `fix` (fixed pane), `kipp` (tilt/"Uchyl"), `drey`
  (turn/"Rozwierne lewe"), `dreykipp` (turn-tilt/"RU lewe").
- **`POSITIONS_PAYLOAD_CODE`** — maps a human position name to the numeric `@position` value
  eko4u expects in the payload: `unten`(bottom)=1, `oben`(top)=0, `links`(left)=2,
  `rechts`(right)=3.
- **`BE82_ZUSTAPROFILES` / `BE92_ZUSTAPROFILES` / `GE76_2D_ZUSTAPROFILES` /
  `GE76_3D_ZUSTAPROFILES`** — one dict per system, each keyed by position
  (`oben`/`links`/`unten`/`rechts`) holding a list of
  `{ "code_name": ..., "title": ... }` peripheral-profile ("Zustaprofil") entries available
  at that position for that system — sills, widening strips, vent profiles, etc. (e.g.
  `SL_NP0360` "Fensterbankanschluss 40 mm / BE 82", `INVISIVENT` "Lüfter RENSON
  INVISIVENT"). Entries are commented out with `#` where a profile isn't actually offered for
  that position/system — leave those commented rather than deleting them, they document
  options that were tried and rejected. `zustaprofile_scraper.py` iterates every
  `(system, position, profile)` triple across these four dicts via `iter_profile_targets()`.

## Chrome extension internals (`eko4u-csv-extension/`)

Manifest V3, four scripts working together to get around the fact that page-world JS can't
read browser-managed headers (Cookie, User-Agent, Referer, etc.) while the background
service worker can't see `fetch`/`XHR` calls made by the page:

| File | World | Role |
|---|---|---|
| `interceptor.js` | MAIN (page) | Monkey-patches `window.fetch` and `XMLHttpRequest.prototype.{open,send,setRequestHeader}`. When a POST to `configurator.workshop` is seen, it parses the request body (URLSearchParams/JSON/FormData) and the JSON response, then `postMessage`s both to the page. |
| `bridge.js` | ISOLATED | Listens for that `postMessage`, then relays it via `chrome.runtime.sendMessage` to the background worker (only the isolated world has `chrome.runtime`). |
| `background.js` | service worker | Listens on `chrome.webRequest.onBeforeSendHeaders` to capture the *real* outgoing headers (including ones JS can't read) for any POST to `configurator.workshop`, merges them with the bridged payload/response into `lastCapture`, and re-injects `bridge.js`/`interceptor.js` into every `eko4u.com` tab on load. Answers `GET_LAST_CAPTURE` from the popup. |
| `popup.js` / `popup.html` | popup | Requests `GET_LAST_CAPTURE` from the background worker and renders the price banner + `PATH,VALUE` CSV preview (copy/download). |

`manifest.json` declares `webRequest`, `storage`, `tabs`, `scripting` permissions, host
permission for `https://eko4u.com/*`, and exposes `interceptor.js` as a
`web_accessible_resource` so it can be injected into the page's MAIN world.

## Scraper internals worth knowing

- **`check_filename_matches_content`** (`scraper.py`) — before scraping a `requests/*.csv`
  file, it cross-checks the file's `ITEM`/`SYSTEM` payload fields against `ITEMS`/`SYSTEMS`
  in `lookup.py` and raises if the filename (`<item>---<system>.csv`) doesn't match what's
  actually inside — catches copy-paste/rename mistakes when adding new request CSVs.
- **`parse_price`** (`scraper.py`) — eko4u returns prices like `"1.234,56 €"`; this strips
  the `€`/NBSP, finds the rightmost `,`/`.` as the decimal separator, strips thousands
  separators from the integer part, and returns a `float`.
- **`apply_position`** (`zustaprofile_scraper.py`) — a peripheral-profile CSV fragment has a
  `[@position]` field at index `[1]` or `[999]`; this overwrites it with the numeric code from
  `POSITIONS_PAYLOAD_CODE` for the position currently being scraped.
- **`build_profile_payload`** (`zustaprofile_scraper.py`) — splices a zustaprofile fragment
  into the base `fix---<system>.csv` payload at the `PERIPHERAL_PROFILES][PERIPHERAL_PROFILE`
  key, replacing whatever placeholder rows were there.
- Both `scraper.py` and `zustaprofile_scraper.py` are resumable: `list_available()` filters
  out any item/system or system/position/profile combo whose `*---output.csv` already
  exists, so re-running after an interruption only scrapes what's missing.
