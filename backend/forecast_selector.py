import math
import logging

import pandas as pd


DECISION_CUTOFF_HOUR_UTC = 0
logger = logging.getLogger(__name__)


def _prepare_frames(actual_df, forecast_df, horizon):
    if horizon < 0:
        raise ValueError("horizon must be non-negative")

    actual = actual_df.copy()
    forecasts = forecast_df.copy()
    actual["time"] = pd.to_datetime(actual["time"], utc=True, errors="coerce")
    forecasts["time"] = pd.to_datetime(forecasts["time"], utc=True, errors="coerce")
    forecasts["publishTime"] = pd.to_datetime(
        forecasts["publishTime"], utc=True, errors="coerce"
    )
    actual = (
        actual.dropna(subset=["time"])
        .drop_duplicates(subset=["time"], keep="last")
    )
    forecasts = (
        forecasts.dropna(subset=["time", "publishTime", "forecast"])
        .sort_values(["time", "publishTime"])
        .drop_duplicates(subset=["time", "publishTime"], keep="last")
    )
    return actual, forecasts


def selection_diagnostics(actual_df, forecast_df, horizon):
    """Return counts for every forecast-selection stage in UTC."""
    actual, forecasts = _prepare_frames(actual_df, forecast_df, horizon)
    exact = forecasts[forecasts["time"].isin(actual["time"])]
    day_ahead = exact[
        exact["publishTime"]
        <= exact["time"].dt.normalize() - pd.Timedelta(days=1)
    ]
    day_ahead = day_ahead.assign(
        lead_hours=(
            day_ahead["time"] - day_ahead["publishTime"]
        ).dt.total_seconds() / 3600
    )
    horizon_eligible = day_ahead[day_ahead["lead_hours"] >= horizon]
    selected = select_forecast(actual, forecasts, horizon)
    diagnostics = {
        "actual_records": int(len(actual)),
        "forecast_records": int(len(forecasts)),
        "exact_start_time_records": int(len(exact)),
        "day_ahead_records": int(len(day_ahead)),
        "horizon_eligible_records": int(len(horizon_eligible)),
        "selected_forecasts": int(len(selected)),
        "max_day_ahead_lead_hours": (
            float(day_ahead["lead_hours"].max()) if not day_ahead.empty else None
        ),
    }
    logger.info("Forecast selection diagnostics horizon=%sh: %s", horizon, diagnostics)
    return diagnostics


def select_forecast(actual_df, forecast_df, horizon):
    """Select the latest forecast satisfying the day-ahead and lead-time rules.

    A forecast must be published no later than midnight UTC on the day before
    delivery and must have at least ``horizon`` hours of lead time. Both
    constraints are evaluated from UTC-normalized startTime/publishTime values.
    """
    if actual_df.empty or forecast_df.empty:
        return pd.DataFrame(columns=["time", "forecast"])

    actual, forecasts = _prepare_frames(actual_df, forecast_df, horizon)

    selected_rows = []
    for target_time in actual["time"].dropna().drop_duplicates():
        delivery_day_start = target_time.normalize()
        decision_cutoff = delivery_day_start - pd.Timedelta(days=1)
        horizon_cutoff = target_time - pd.Timedelta(hours=float(horizon))
        cutoff = min(decision_cutoff, horizon_cutoff)
        valid = forecasts[
            (forecasts["time"] == target_time)
            & (forecasts["publishTime"] <= cutoff)
        ]
        if not valid.empty:
            latest = valid.sort_values("publishTime").iloc[-1]
            selected_rows.append({"time": target_time, "forecast": latest["forecast"]})

    return pd.DataFrame(selected_rows, columns=["time", "forecast"])


def calculate_metrics(merged_df):
    valid = merged_df.dropna(subset=["actual", "forecast"]).copy()
    if valid.empty:
        return {"mae": None, "rmse": None, "bias": None, "valid_intervals": 0}

    error = valid["forecast"] - valid["actual"]
    return {
        "mae": float(error.abs().mean()),
        "rmse": float(math.sqrt((error ** 2).mean())),
        "bias": float(error.mean()),
        "valid_intervals": int(len(valid)),
    }
