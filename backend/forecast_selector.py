import math

import pandas as pd


DECISION_CUTOFF_HOUR_UTC = 0


def select_forecast(actual_df, forecast_df, horizon):
    """Select the latest forecast available at the day-ahead decision cutoff.

    The cutoff is midnight UTC on the day before delivery. A selected forecast
    also cannot be newer than the requested horizon, preventing future leakage
    when the horizon is greater than one day.
    """
    if actual_df.empty or forecast_df.empty:
        return pd.DataFrame(columns=["time", "forecast"])

    actual = actual_df.copy()
    forecasts = forecast_df.copy()
    actual["time"] = pd.to_datetime(actual["time"], utc=True)
    forecasts["time"] = pd.to_datetime(forecasts["time"], utc=True)
    forecasts["publishTime"] = pd.to_datetime(forecasts["publishTime"], utc=True)
    actual = actual.drop_duplicates(subset=["time"], keep="last")
    forecasts = forecasts.dropna(subset=["time", "publishTime", "forecast"])
    forecasts = (
        forecasts.sort_values(["time", "publishTime"])
        .drop_duplicates(subset=["time", "publishTime"], keep="last")
    )

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
