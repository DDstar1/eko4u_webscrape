import csv
import time

from lookup import (
    BE82_ZUSTAPROFILES,
    BE92_ZUSTAPROFILES,
    GE76_2D_ZUSTAPROFILES,
    GE76_3D_ZUSTAPROFILES,
    POSITIONS_PAYLOAD_CODE,
)
from scraper import (
    BASE_DIR,
    REQUEST_DELAY_SECONDS,
    build_payload as set_dimensions,
    fetch_price,
    load_dimensions,
)

PROFILES_DIR = BASE_DIR / "requests" / "profiles"
ZUSTA_DIR = BASE_DIR / "requests" / "zustaprofile"
OUTPUT_DIR = BASE_DIR / "excel_outputs" / "zustaprofile"
PERIPHERAL_PREFIX = "WORKSHOP[CONFIGS][CONFIG][0][PERIPHERAL_PROFILES][PERIPHERAL_PROFILE]"

SYSTEM_ZUSTAPROFILES = {
    "be82": BE82_ZUSTAPROFILES,
    "be92": BE92_ZUSTAPROFILES,
    "ge76_2d": GE76_2D_ZUSTAPROFILES,
    "ge76_3d": GE76_3D_ZUSTAPROFILES,
}


def load_csv_rows(path):
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        next(reader)  # skip PATH,VALUE header
        return [list(row) for row in reader if row]


def load_base_payload(system_short):
    return load_csv_rows(PROFILES_DIR / f"fix---{system_short}.csv")


def load_zustaprofile_rows(code_name):
    return load_csv_rows(ZUSTA_DIR / f"{code_name}.csv")


def apply_position(rows, position_value):
    rows = [list(r) for r in rows]
    for r in rows:
        if r[0].endswith("[1][@position]"):
            r[1] = str(position_value)
            return rows
    for r in rows:
        if r[0].endswith("[999][@position]"):
            r[1] = str(position_value)
            return rows
    raise ValueError("No [@position] field found to set")


def build_profile_payload(system_short, position, code_name):
    base_rows = load_base_payload(system_short)
    zusta_rows = load_zustaprofile_rows(code_name)
    zusta_rows = apply_position(zusta_rows, POSITIONS_PAYLOAD_CODE[position])

    insert_at = next(i for i, r in enumerate(base_rows) if r[0].startswith(PERIPHERAL_PREFIX))
    before = [r for r in base_rows[:insert_at] if not r[0].startswith(PERIPHERAL_PREFIX)]
    after = [r for r in base_rows[insert_at:] if not r[0].startswith(PERIPHERAL_PREFIX)]

    return before + zusta_rows + after


def iter_profile_targets():
    for system_short, zusta in SYSTEM_ZUSTAPROFILES.items():
        for position, profiles in zusta.items():
            for profile in profiles:
                yield system_short, position, profile["code_name"]


def output_path_for(system_short, position, code_name):
    return OUTPUT_DIR / f"fix---{system_short}---{position}---{code_name}---output.csv"


def list_available(targets):
    return [t for t in targets if not output_path_for(*t).exists()]


def prompt_selection(available):
    print("Available to scrape (already-completed combos are hidden):")
    for i, (system_short, position, code_name) in enumerate(available, start=1):
        print(f"  {i}. fix---{system_short}---{position}---{code_name}")

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


def scrape_target(system_short, position, code_name, dimensions):
    output_path = output_path_for(system_short, position, code_name)
    template = build_profile_payload(system_short, position, code_name)
    print(f"[fix---{system_short}---{position}---{code_name}] scraping {len(dimensions)} dimensions -> {output_path.name}")

    rows = []
    for width, height in dimensions:
        payload = set_dimensions(template, width, height)
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
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    dimensions = load_dimensions()
    targets = list(iter_profile_targets())

    available = list_available(targets)
    if not available:
        print("Nothing to do - every combo is already scraped.")
        return

    chosen = prompt_selection(available)
    if not chosen:
        print("Nothing selected.")
        return

    for system_short, position, code_name in chosen:
        scrape_target(system_short, position, code_name, dimensions)


if __name__ == "__main__":
    run()
