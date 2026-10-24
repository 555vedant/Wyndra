import React, { useState } from "react";
import axios from "axios";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Legend,
  Tooltip,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Legend, Tooltip, Filler);

const API_URL = process.env.REACT_APP_API_URL || "http://127.0.0.1:8000";

function formatTime(value) {
  return new Date(value).toLocaleString("en-GB", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function chartOptions(title, yAxisTitle = "Power (MW)") {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: true }, title: { display: true, text: title } },
    scales: {
      x: { ticks: { color: "#6b7280", maxTicksLimit: 8 } },
      y: { title: { display: true, text: yAxisTitle }, beginAtZero: false },
    },
  };
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normaliseResponse(payload) {
  const rows = Array.isArray(payload) ? payload : payload?.data;
  const data = Array.isArray(rows)
    ? Array.from(
        new Map(
          rows
            .map((item) => {
              const parsedTime = item?.time ? new Date(item.time) : null;
              return parsedTime && !Number.isNaN(parsedTime.getTime())
                ? [
                    parsedTime.toISOString(),
                    {
                      ...item,
                      time: parsedTime.toISOString(),
                      actual: finiteNumber(item.actual),
                      forecast: finiteNumber(item.forecast),
                    },
                  ]
                : null;
            })
            .filter((entry) => entry !== null),
        ).values(),
      ).sort((left, right) => left.time.localeCompare(right.time))
    : [];
  const matched = data.filter(
    (item) => item.actual !== null && item.forecast !== null,
  );
  const errors = matched.map((item) => Number(item.forecast) - Number(item.actual));
  const metrics = errors.length
    ? {
        mae: errors.reduce((sum, value) => sum + Math.abs(value), 0) / errors.length,
        rmse: Math.sqrt(errors.reduce((sum, value) => sum + value ** 2, 0) / errors.length),
        bias: errors.reduce((sum, value) => sum + value, 0) / errors.length,
        valid_intervals: errors.length,
      }
    : { mae: null, rmse: null, bias: null, valid_intervals: 0 };
  return { data, metrics, quality: payload?.quality || null };
}

export function buildChartData(data) {
  const labels = data.map((item) => formatTime(item.time));
  const errorRows = data.filter((item) => item.actual !== null && item.forecast !== null);
  return {
    comparison: {
      labels,
      datasets: [
        { label: "Actual generation", data: data.map((item) => item.actual) },
        { label: "Forecast generation", data: data.map((item) => item.forecast) },
      ],
    },
    errors: errorRows.map((item) => item.forecast - item.actual),
    errorLabels: errorRows.map((item) => formatTime(item.time)),
  };
}

function App() {
  const [start, setStart] = useState("2026-01-01");
  const [end, setEnd] = useState("2026-01-31");
  const [horizon, setHorizon] = useState(24);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await axios.get(`${API_URL}/wind-data`, {
        params: { start, end, horizon },
      });
      setResult(normaliseResponse(response.data));
    } catch (requestError) {
      setResult(null);
      setError(requestError.response?.data?.detail || "Unable to load Elexon data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const data = result?.data || [];
  const selectionStages = result?.quality?.selection_stages;
  const noEligibleForecasts = Boolean(
    selectionStages && selectionStages.horizon_eligible_records === 0,
  );
  const maxAvailableHorizon = selectionStages?.max_day_ahead_lead_hours;
  const chartData = buildChartData(data);
  const comparison = {
    ...chartData.comparison,
    datasets: [
      { ...chartData.comparison.datasets[0], borderColor: "#2563eb", backgroundColor: "#2563eb", pointRadius: 0 },
      ...(!noEligibleForecasts ? [{
        ...chartData.comparison.datasets[1],
        borderColor: "#16a34a",
        backgroundColor: "#16a34a",
        pointRadius: 2,
        spanGaps: true,
      }] : []),
    ],
  };
  const { errorLabels, errors } = chartData;
  const errorChart = {
    labels: errorLabels,
    datasets: [
      {
        label: "Forecast error (forecast - actual)",
        data: errors,
        borderColor: "#dc2626",
        backgroundColor: "rgba(220, 38, 38, 0.15)",
        borderWidth: 2,
        pointRadius: 2,
        pointBackgroundColor: "#dc2626",
        fill: true,
        tension: 0.15,
      },
      {
        label: "Zero reference",
        data: errors.map(() => 0),
        borderColor: "#6b7280",
        borderDash: [6, 4],
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false,
      },
    ],
  };
  const metrics = noEligibleForecasts ? null : result?.metrics;

  return (
    <main style={{ fontFamily: "sans-serif", padding: 30, maxWidth: 1100, margin: "0 auto" }}>
      <h1>Wind generation forecast monitor</h1>
      <p>UK national wind delivery intervals and day-ahead forecast accuracy for January 2026.</p>
      <p><small>Decision assumption: the latest forecast published by 00:00 UTC on the day before delivery is used.</small></p>

      <section style={{ display: "flex", gap: 20, alignItems: "flex-end", flexWrap: "wrap", margin: "28px 0" }}>
        <label>Start date<input type="date" min="2026-01-01" max="2026-01-31" value={start} onChange={(event) => setStart(event.target.value)} /></label>
        <label>End date<input type="date" min="2026-01-01" max="2026-01-31" value={end} onChange={(event) => setEnd(event.target.value)} /></label>
        <label style={{ minWidth: 220 }}>Minimum forecast horizon: {horizon}h<input type="range" min="0" max="168" value={horizon} onChange={(event) => setHorizon(Number(event.target.value))} /></label>
        <button type="button" onClick={fetchData} disabled={loading}>{loading ? "Loading..." : "Load data"}</button>
      </section>

      {error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}
      {loading && <p aria-live="polite">Loading Elexon actuals and forecasts...</p>}
      {result && data.length === 0 && <p>No actual intervals were returned for this date range.</p>}
      {noEligibleForecasts && (
        <p role="status" style={{ color: "#92400e" }}>
          No forecast data is available for the selected {horizon}h minimum horizon.
          The maximum available day-ahead horizon is {maxAvailableHorizon == null ? "unknown" : `${maxAvailableHorizon.toFixed(1)}h`}.
          Actual generation remains visible; forecast comparisons and metrics are hidden.
        </p>
      )}

      {metrics && (
        <section aria-label="Forecast accuracy metrics" style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 25 }}>
          {[["MAE", metrics.mae], ["RMSE", metrics.rmse], ["Bias", metrics.bias], ["Valid intervals", metrics.valid_intervals]].map(([label, value]) => (
            <div key={label} style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: 14, minWidth: 130 }}>
              <strong>{label}</strong><div>{value == null ? "—" : typeof value === "number" && label !== "Valid intervals" ? `${value.toFixed(2)} MW` : value}</div>
            </div>
          ))}
        </section>
      )}

      {data.length > 0 && (
        <>
          <section aria-label={noEligibleForecasts ? "Actual generation chart" : "Actual and forecast generation chart"} style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: 18, marginTop: 10 }}>
            <h2 style={{ margin: "0 0 16px" }}>{noEligibleForecasts ? "Actual generation" : "Actual vs forecast generation"}</h2>
            <div style={{ height: 420 }}><Line data={comparison} options={chartOptions("Actual and forecast generation")} /></div>
          </section>
          {!noEligibleForecasts && errors.length > 0 ? (
            <section aria-label="Forecast error chart" style={{ border: "1px solid #fecaca", borderRadius: 8, padding: 18, marginTop: 30 }}>
              <h2 style={{ color: "#b91c1c", margin: "0 0 16px" }}>Forecast error over time</h2>
              <p style={{ marginTop: 0 }}>Error = forecast minus actual (MW).</p>
              <div style={{ height: 380 }}><Line data={errorChart} options={chartOptions("Forecast error over time", "Error (MW)")} /></div>
            </section>
          ) : (
            <p>No matched actual and forecast intervals are available for the selected range.</p>
          )}
        </>
      )}
    </main>
  );
}

export default App;
