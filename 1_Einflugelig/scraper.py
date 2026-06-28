import csv
import json
import re
import socket
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlencode

from lookup import ITEMS, SYSTEMS

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE_DIR = Path(__file__).parent
REQUESTS_DIR = BASE_DIR / "requests"
OUTPUT_DIR = BASE_DIR / "excel_outputs"
DIMENSIONS_FILE = BASE_DIR.parent / "all_dimensions.csv"
HEADERS_FILE = BASE_DIR.parent / "headers.csv"
URL = "https://eko4u.com/?p=configurator.workshop"
ITEM_KEY = "WORKSHOP[CONFIGS][CONFIG][0][ITEM]"
SYSTEM_KEY = "WORKSHOP[CONFIGS][CONFIG][0][SYSTEM]"
WIDTH_KEY = "WORKSHOP[CONFIGS][CONFIG][0][WIDTH]"
HEIGHT_KEY = "WORKSHOP[CONFIGS][CONFIG][0][HEIGHT]"
REQUEST_DELAY_SECONDS = 0.4
NETWORK_RETRY_DELAY_SECONDS = 10
NETWORK_ERRORS = (urllib.error.URLError, socket.timeout, ConnectionError, TimeoutError)


def load_payload_template(csv_path):
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        next(reader)  # skip PATH,VALUE header
        return [(row[0], row[1]) for row in reader]


def load_headers():
    with open(HEADERS_FILE, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        next(reader)  # skip PATH,VALUE header
        return {row[0]: row[1] for row in reader if row}


def check_filename_matches_content(csv_path, template):
    values = dict(template)
    item_name = ITEMS.get(values.get(ITEM_KEY))
    system_name = SYSTEMS.get(values.get(SYSTEM_KEY))
    expected_stem = f"{item_name}---{system_name}"
    if csv_path.stem != expected_stem:
        raise ValueError(
            f"{csv_path.name}: filename does not match content "
            f"(ITEM={values.get(ITEM_KEY)!r} SYSTEM={values.get(SYSTEM_KEY)!r} "
            f"-> expected '{expected_stem}.csv')"
        )


def load_dimensions():
    with open(DIMENSIONS_FILE, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return [(row["width"], row["height"]) for row in reader]


def build_payload(template, width, height):
    payload = []
    for key, value in template:
        if key == WIDTH_KEY:
            value = width
        elif key == HEIGHT_KEY:
            value = height
        payload.append((key, value))
    return payload


def fetch_price(payload):
    headers = load_headers()
    for key in [k for k in headers if k.lower() == "accept-encoding"]:
        del headers[key]
    headers["Accept-Encoding"] = "identity"
    data = urlencode(payload).encode("utf-8")
    req = urllib.request.Request(URL, data=data, headers=headers, method="POST")

    while True:
        try:
            with urllib.request.urlopen(req) as resp:
                body = resp.read().decode("utf-8", errors="replace")
            break
        except NETWORK_ERRORS as exc:
            print(f"  [NETWORK] {exc} -- retrying in {NETWORK_RETRY_DELAY_SECONDS}s")
            time.sleep(NETWORK_RETRY_DELAY_SECONDS)

    parsed = json.loads(body, strict=False)
    price_raw = parsed.get("PRICE", "")
    if not price_raw:
        return None
    return parse_price(price_raw)


def parse_price(price_raw):
    cleaned = price_raw.replace("\xa0", "").replace("€", "").strip()
    decimal_pos = max(cleaned.rfind(","), cleaned.rfind("."))
    if decimal_pos == -1:
        return float(cleaned)
    integer_part = re.sub(r"[.,]", "", cleaned[:decimal_pos])
    decimal_part = cleaned[decimal_pos + 1:]
    return float(f"{integer_part}.{decimal_part}")


def output_path_for(stem):
    return OUTPUT_DIR / f"{stem}---output.csv"


def list_available(request_files):
    return [rf for rf in request_files if not output_path_for(rf.stem).exists()]


def prompt_selection(available):
    print("Available to scrape (already-completed files are hidden):")
    for i, request_file in enumerate(available, start=1):
        print(f"  {i}. {request_file.stem}")

    raw = input("Enter numbers to run (comma-separated) or 'all': ").strip()
    if raw.lower() == "all":
        return list(available)

    chosen = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        index = int(part)
        if 1 <= index <= len(available):
            chosen.append(available[index - 1])
    return chosen


def scrape_file(request_file, dimensions):
    stem = request_file.stem
    template = load_payload_template(request_file)
    check_filename_matches_content(request_file, template)
    output_path = output_path_for(stem)
    print(f"[{stem}] scraping {len(dimensions)} dimensions -> {output_path.name}")

    rows = []
    for width, height in dimensions:
        payload = build_payload(template, width, height)
        try:
            price = fetch_price(payload)
            print(f"  ✔ {width}x{height}: {price}")
        except Exception as exc:
            print(f"  ✘ {width}x{height}: ERROR {exc}")
            price = None
        rows.append([width, height, price if price is not None else ""])
        time.sleep(REQUEST_DELAY_SECONDS)

    with open(output_path, "w", newline="", encoding="utf-8") as out_f:
        writer = csv.writer(out_f)
        writer.writerow(["width", "height", "price"])
        writer.writerows(rows)


def run():
    OUTPUT_DIR.mkdir(exist_ok=True)
    dimensions = load_dimensions()
    request_files = sorted(REQUESTS_DIR.glob("*.csv"))

    available = list_available(request_files)
    if not available:
        print("Nothing to do - every file is already scraped or in progress.")
        return

    chosen = prompt_selection(available)
    if not chosen:
        print("Nothing selected.")
        return

    for request_file in chosen:
        scrape_file(request_file, dimensions)


if __name__ == "__main__":
    run()
