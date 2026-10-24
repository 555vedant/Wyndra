import math

import requests
import pandas as pd


ACTUAL_URL = "https://data.elexon.co.uk/bmrs/api/v1/datasets/FUELHH/stream"
FORECAST_URL = "https://data.elexon.co.uk/bmrs/api/v1/datasets/WINDFOR/stream"
REQUEST_TIMEOUT = 30


def _numeric_value(value):
    if value is None or value == "":
        return None
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError):
        return None


def _get_json(url, params):
    response = requests.get(url, params=params, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, list):
        raise ValueError("Elexon returned an unexpected response format")
    return payload


def fetch_actual(start, end):
    params = {
        "fuelType": "WIND",
        "settlementDateFrom": start,
        "settlementDateTo": end
    }
    data = _get_json(ACTUAL_URL, params)
    
    rows = []
    for item in data:
        generation = _numeric_value(item.get("generation"))
        if item.get("startTime") is not None and generation is not None:
            rows.append({"time": item["startTime"], "actual": generation})
    return (
        pd.DataFrame(rows, columns=["time", "actual"])
        .assign(time=lambda frame: pd.to_datetime(frame["time"], utc=True, errors="coerce"))
        .dropna(subset=["time"])
        .drop_duplicates(subset=["time"], keep="last")
        .sort_values("time")
        .reset_index(drop=True)
    )


def fetch_forecast(start, end, horizon=24):
    publication_lookback_days = max(2, math.ceil(float(horizon) / 24))
    start_date = pd.Timestamp(start, tz="UTC") - pd.Timedelta(days=publication_lookback_days)
    params = {
        "publishDateTimeFrom": start_date.isoformat().replace("+00:00", "Z"),
        "publishDateTimeTo": end + "T23:59:00Z"
    }
    data = _get_json(FORECAST_URL, params)
    
    rows = []
    for item in data:
        generation = _numeric_value(item.get("generation"))
        if all(item.get(key) is not None for key in ("startTime", "publishTime")) and generation is not None:
            rows.append({
                "time": item["startTime"],
                "publishTime": item["publishTime"],
                "forecast": generation,
            })
    return (
        pd.DataFrame(rows, columns=["time", "publishTime", "forecast"])
        .assign(
            time=lambda frame: pd.to_datetime(frame["time"], utc=True, errors="coerce"),
            publishTime=lambda frame: pd.to_datetime(frame["publishTime"], utc=True, errors="coerce"),
        )
        .dropna(subset=["time", "publishTime"])
        .drop_duplicates(subset=["time", "publishTime", "forecast"])
        .sort_values(["time", "publishTime"])
        .reset_index(drop=True)
    )