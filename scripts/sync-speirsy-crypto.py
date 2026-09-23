#!/usr/bin/env python3

import io
import json
import os
import subprocess
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pyarrow.parquet as pq


SOURCE_BASE = "https://raw.githubusercontent.com/Speirsy11/crypto-dataset/main/data"
MANIFEST_URL = "https://raw.githubusercontent.com/Speirsy11/crypto-dataset/main/metadata/manifest.json"
OUTPUT_DIR = Path("data/crypto-history")
SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT",
           "TRXUSDT", "DOGEUSDT", "ZECUSDT", "ADAUSDT", "BCHUSDT"]
HOURLY_DAYS = 120
MAX_WORKERS = 8


def http_bytes(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Worth-It-Crypto-History-Sync/1.0"})
    with urllib.request.urlopen(req, timeout=60) as response:
        return response.read()


def month_range(start_dt, end_dt):
    result = []
    current = datetime(start_dt.year, start_dt.month, 1, tzinfo=timezone.utc)
    limit = datetime(end_dt.year, end_dt.month, 1, tzinfo=timezone.utc)
    while current <= limit:
        result.append((current.year, current.month))
        if current.month == 12:
            current = current.replace(year=current.year + 1, month=1)
        else:
            current = current.replace(month=current.month + 1)
    return result


def read_manifest():
    return json.loads(http_bytes(MANIFEST_URL).decode("utf-8"))


def load_existing(symbol):
    path = OUTPUT_DIR / f"{symbol}.json"
    if not path.exists():
        return {"symbol": symbol, "source": "Speirsy11/crypto-dataset", "daily": [], "hourly": []}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {"symbol": symbol, "source": "Speirsy11/crypto-dataset", "daily": [], "hourly": []}


def fetch_month(symbol, interval, year, month):
    ym = f"{year:04d}/month={month:02d}"
    filename = f"{symbol}-{interval}-{year:04d}-{month:02d}.parquet"
    url = f"{SOURCE_BASE}/interval_id={interval}/symbol_id={symbol}/year={year:04d}/month={month:02d}/{filename}"
    try:
        payload = http_bytes(url)
        table = pq.read_table(io.BytesIO(payload), columns=["timestamp", "open", "high", "low", "close", "volume"])
        rows = table.to_pylist()
        return symbol, interval, rows
    except urllib.error.HTTPError as exc:
        # A missing future/current partition is normal.
        if exc.code == 404:
            return symbol, interval, []
        raise
    except Exception:
        raise


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
        "v": float(row["volume"]),
    }


def merge_rows(existing, fresh):
    merged = {int(row["t"]): row for row in existing if "t" in row}
    for row in fresh:
        normalized = normalize_row(row)
        merged[normalized["t"]] = normalized
    return [merged[key] for key in sorted(merged)]


def main():
    manifest = read_manifest()
    cutoff = datetime.fromisoformat(
        manifest["cutoff_utc_exclusive"].replace("Z", "+00:00")
    )
    cutoff_day = cutoff - timedelta(days=1)
    hourly_start = cutoff_day - timedelta(days=HOURLY_DAYS)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    tasks = []
    existing = {}

    for symbol in SYMBOLS:
        data = load_existing(symbol)
        existing[symbol] = data

        start_raw = manifest["symbol_start_times"][symbol]
        symbol_start = datetime.fromisoformat(start_raw.replace("Z", "+00:00"))

        if data["daily"]:
            # Re-fetch the latest two months so current-month revisions are picked up.
            daily_start = cutoff - timedelta(days=62)
        else:
            daily_start = symbol_start

        for year, month in month_range(daily_start, cutoff):
            tasks.append((symbol, "1d", year, month))

        for year, month in month_range(hourly_start, cutoff):
            tasks.append((symbol, "1h", year, month))

    fresh_daily = {symbol: [] for symbol in SYMBOLS}
    fresh_hourly = {symbol: [] for symbol in SYMBOLS}

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = [pool.submit(fetch_month, *task) for task in tasks]
        for future in as_completed(futures):
            symbol, interval, rows = future.result()
            if interval == "1d":
                fresh_daily[symbol].extend(rows)
            else:
                fresh_hourly[symbol].extend(rows)

    updated = False

    for symbol in SYMBOLS:
        data = existing[symbol]

        daily = merge_rows(data.get("daily", []), fresh_daily[symbol])
        hourly = merge_rows(data.get("hourly", []), fresh_hourly[symbol])

        hourly_floor = int(hourly_start.timestamp() * 1000)
        hourly = [row for row in hourly if row["t"] >= hourly_floor]

        out = {
            "symbol": symbol,
            "pair": f"{symbol[:-4]}/USDT",
            "source": "Speirsy11/crypto-dataset",
            "license": "CC0 1.0",
            "updatedAt": cutoff.isoformat(),
            "daily": daily,
            "hourly": hourly,
        }

        path = OUTPUT_DIR / f"{symbol}.json"
        serialized = json.dumps(out, separators=(",", ":"), ensure_ascii=False) + "\n"

        if not path.exists() or path.read_text(encoding="utf-8") != serialized:
            path.write_text(serialized, encoding="utf-8")
            updated = True

    print(f"Speirsy sync complete. changed={updated} cutoff={cutoff.isoformat()}")
    if updated:
        subprocess.run(["git", "status", "--short"], check=False)


if __name__ == "__main__":
    main()
