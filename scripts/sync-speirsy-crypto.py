#!/usr/bin/env python3

import json
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pyarrow.parquet as pq


SPEIRSY_ROOT = Path(os.environ.get("SPEIRSY_ROOT", "../crypto-dataset")).resolve()
DATA_ROOT = SPEIRSY_ROOT / "data"
METADATA_ROOT = SPEIRSY_ROOT / "metadata"
OUTPUT_DIR = Path("data/crypto-history")
SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT",
           "TRXUSDT", "DOGEUSDT", "ZECUSDT", "ADAUSDT", "BCHUSDT"]
HOURLY_DAYS = 120
MAX_WORKERS = 8


def month_floor(value):
    return datetime(value.year, value.month, 1, tzinfo=timezone.utc)


def month_range(start_dt, end_dt):
    result = []
    current = month_floor(start_dt)
    limit = month_floor(end_dt)

    while current <= limit:
        result.append((current.year, current.month))

        if current.month == 12:
            current = current.replace(year=current.year + 1, month=1)
        else:
            current = current.replace(month=current.month + 1)

    return result


def read_manifest():
    path = METADATA_ROOT / "manifest.json"
    if not path.exists():
        raise FileNotFoundError(f"Speirsy manifest not found: {path}")

    return json.loads(path.read_text(encoding="utf-8"))


def load_existing(symbol):
    path = OUTPUT_DIR / f"{symbol}.json"

    if not path.exists():
        return {
            "symbol": symbol,
            "source": "Speirsy11/crypto-dataset",
            "daily": [],
            "hourly": []
        }

    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {
            "symbol": symbol,
            "source": "Speirsy11/crypto-dataset",
            "daily": [],
            "hourly": []
        }


def local_partition(symbol, interval, year, month):
    return (
        DATA_ROOT
        / f"interval_id={interval}"
        / f"symbol_id={symbol}"
        / f"year={year:04d}"
        / f"month={month:02d}"
        / f"{symbol}-{interval}-{year:04d}-{month:02d}.parquet"
    )


def read_partition(symbol, interval, year, month):
    path = local_partition(symbol, interval, year, month)

    if not path.exists():
        # A future/current partition may not exist yet.
        return []

    try:
        table = pq.read_table(
            path,
            columns=["timestamp", "open", "high", "low", "close", "volume"]
        )
        return table.to_pylist()
    except Exception as exc:
        raise RuntimeError(f"Could not read Parquet file: {path}") from exc


def normalize_row(row):
    timestamp = row["timestamp"]

    if hasattr(timestamp, "timestamp"):
        ts = int(timestamp.timestamp() * 1000)
    else:
        ts = int(timestamp)

    return {
        "t": ts,
        "o": float(row["open"]),
        "h": float(row["high"]),
        "l": float(row["low"]),
        "c": float(row["close"]),
        "v": float(row["volume"])
    }


def merge_rows(existing, fresh):
    merged = {
        int(row["t"]): row
        for row in existing
        if isinstance(row, dict) and "t" in row
    }

    for row in fresh:
        normalized = normalize_row(row)
        merged[normalized["t"]] = normalized

    return [merged[key] for key in sorted(merged)]


def collect_symbol(symbol, daily_start, cutoff, hourly_start):
    daily = []
    hourly = []

    for year, month in month_range(daily_start, cutoff):
        daily.extend(read_partition(symbol, "1d", year, month))

    for year, month in month_range(hourly_start, cutoff):
        hourly.extend(read_partition(symbol, "1h", year, month))

    return symbol, daily, hourly


def main():
    manifest = read_manifest()

    cutoff = datetime.fromisoformat(
        manifest["cutoff_utc_exclusive"].replace("Z", "+00:00")
    )

    latest_complete_day = cutoff - timedelta(days=1)
    hourly_start = latest_complete_day - timedelta(days=HOURLY_DAYS)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    existing = {
        symbol: load_existing(symbol)
        for symbol in SYMBOLS
    }

    tasks = []

    for symbol in SYMBOLS:
        start_raw = manifest["symbol_start_times"][symbol]
        symbol_start = datetime.fromisoformat(
            start_raw.replace("Z", "+00:00")
        )

        # Re-read the most recent two months on every update so the current
        # partitions are corrected/replaced when the upstream dataset changes.
        daily_start = max(
            symbol_start,
            cutoff - timedelta(days=62)
        ) if existing[symbol]["daily"] else symbol_start

        tasks.append((symbol, daily_start, cutoff, hourly_start))

    collected = {}

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = [
            pool.submit(collect_symbol, *task)
            for task in tasks
        ]

        for future in as_completed(futures):
            symbol, daily, hourly = future.result()
            collected[symbol] = (daily, hourly)

    changed = False

    for symbol in SYMBOLS:
        existing_data = existing[symbol]
        daily_fresh, hourly_fresh = collected[symbol]

        daily = merge_rows(
            existing_data.get("daily", []),
            daily_fresh
        )

        hourly = merge_rows(
            existing_data.get("hourly", []),
            hourly_fresh
        )

        hourly_floor = int(hourly_start.timestamp() * 1000)
        hourly = [
            row
            for row in hourly
            if int(row["t"]) >= hourly_floor
        ]

        output = {
            "symbol": symbol,
            "pair": f"{symbol[:-4]}/USDT",
            "source": "Speirsy11/crypto-dataset",
            "license": "CC0 1.0",
            "updatedAt": cutoff.isoformat(),
            "daily": daily,
            "hourly": hourly
        }

        path = OUTPUT_DIR / f"{symbol}.json"
        serialized = json.dumps(
            output,
            separators=(",", ":"),
            ensure_ascii=False
        ) + "\n"

        old = path.read_text(encoding="utf-8") if path.exists() else ""

        if old != serialized:
            path.write_text(serialized, encoding="utf-8")
            changed = True

    print(
        "Speirsy sync complete "
        f"(changed={changed}, cutoff={cutoff.isoformat()}, "
        f"hourly_days={HOURLY_DAYS})"
    )


if __name__ == "__main__":
    main()
