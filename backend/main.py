import numpy as np
import pandas as pd
import requests
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from data_fetcher import fetch_actual, fetch_forecast
from forecast_selector import calculate_metrics, select_forecast, selection_diagnostics

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

JANUARY_START = pd.Timestamp("2026-01-01", tz="UTC")
JANUARY_END = pd.Timestamp("2026-02-01", tz="UTC")


@app.get("/wind-data")
def get_wind_data(
    start: str = Query("2026-01-01"),
    end: str = Query("2026-01-31"),
    horizon: int = Query(24, ge=0, le=168),
):
    try:
        start_time = pd.Timestamp(start, tz="UTC")
        end_time = pd.Timestamp(end, tz="UTC") + pd.Timedelta(days=1)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Dates must use YYYY-MM-DD format") from exc

    if start_time < JANUARY_START or end_time > JANUARY_END or start_time >= end_time:
        raise HTTPException(
            status_code=400,
            detail="Date range must be within January 2026 and start before end",
        )

    try:
        actual = fetch_actual(start, end)
        forecast = fetch_forecast(start, end, horizon)
        diagnostics = selection_diagnostics(actual, forecast, horizon)
        selected = select_forecast(actual, forecast, horizon)
    except (ValueError, KeyError, TypeError, OSError, requests.RequestException) as exc:
        raise HTTPException(status_code=502, detail=f"Unable to retrieve Elexon data: {exc}") from exc

    actual = actual.copy()
    actual["time"] = pd.to_datetime(actual["time"], utc=True)
    actual = actual.drop_duplicates(subset=["time"], keep="last")
    merged = actual.merge(selected, on="time", how="left")
    merged = merged.sort_values("time")
    metrics = calculate_metrics(merged)
    matched_intervals = int(merged["forecast"].notna().sum())
    merged = merged.replace({np.nan: None})
    merged["time"] = merged["time"].map(lambda value: value.isoformat() if value is not None else None)

    return {
        "data": merged.to_dict(orient="records"),
        "metrics": metrics,
        "quality": {
            "actual_intervals": int(len(actual)),
            "forecast_records": int(len(forecast)),
            "forecast_delivery_timestamps": int(forecast["time"].nunique()),
            "selected_forecasts": int(len(selected)),
            "matched_intervals": matched_intervals,
            "unmatched_actual_intervals": int(len(actual) - matched_intervals),
            "selection_stages": diagnostics,
        },
        "assumptions": {
            "decision_cutoff": "00:00 UTC on the day before delivery",
            "selection": "latest publishTime at or before both the day-ahead cutoff and startTime minus the selected horizon",
            "scope": "delivery intervals in January 2026",
        },
    }
