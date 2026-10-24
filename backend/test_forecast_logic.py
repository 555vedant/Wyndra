import pandas as pd

from forecast_selector import calculate_metrics, select_forecast


def test_select_forecast_uses_latest_publish_before_day_ahead_cutoff():
    actual = pd.DataFrame({"time": ["2026-01-10T12:00:00Z"], "actual": [100]})
    forecasts = pd.DataFrame(
        {
            "time": ["2026-01-10T12:00:00Z"] * 3,
            "publishTime": [
                "2026-01-08T23:00:00Z",
                "2026-01-01T00:00:00Z",
                "2026-01-09T01:00:00Z",
            ],
            "forecast": [80, 60, 120],
        }
    )

    selected = select_forecast(actual, forecasts, horizon=4)

    assert selected.iloc[0]["forecast"] == 80


def test_select_forecast_does_not_leak_future_data_and_matches_utc_timestamps():
    actual = pd.DataFrame({"time": ["2026-01-10T00:30:00Z"], "actual": [100]})
    forecasts = pd.DataFrame(
        {
            "time": ["2026-01-10T00:30:00Z", "2026-01-10T00:30:00Z"],
            "publishTime": ["2026-01-09T00:00:00Z", "2026-01-10T00:00:00Z"],
            "forecast": [90, 110],
        }
    )

    selected = select_forecast(actual, forecasts, horizon=0)

    assert selected.iloc[0]["forecast"] == 90


def test_select_forecast_matches_equivalent_timezone_offsets():
    actual = pd.DataFrame({"time": ["2026-01-10T01:00:00+01:00"], "actual": [100]})
    forecasts = pd.DataFrame(
        {
            "time": ["2026-01-10T00:00:00Z"],
            "publishTime": ["2026-01-09T00:00:00Z"],
            "forecast": [110],
        }
    )

    selected = select_forecast(actual, forecasts, horizon=24)

    assert len(selected) == 1
    assert selected.iloc[0]["forecast"] == 110
    assert selected.iloc[0]["time"] == pd.Timestamp("2026-01-10T00:00:00Z")


def test_calculate_metrics_uses_only_valid_matched_intervals():
    merged = pd.DataFrame(
        {"actual": [10, 20, None], "forecast": [12, 16, 100]}
    )

    metrics = calculate_metrics(merged)

    assert metrics["valid_intervals"] == 2
    assert metrics["mae"] == 3
    assert metrics["rmse"] == 10**0.5
    assert metrics["bias"] == -1


def test_select_forecast_returns_stable_empty_shape():
    selected = select_forecast(
        pd.DataFrame(columns=["time", "actual"]),
        pd.DataFrame(columns=["time", "publishTime", "forecast"]),
        horizon=24,
    )

    assert list(selected.columns) == ["time", "forecast"]
    assert selected.empty
