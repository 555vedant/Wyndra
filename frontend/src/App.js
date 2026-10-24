import React, { memo, useMemo, useState } from "react";
import axios from "axios";
import "./App.css";
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
const MAX_HORIZON = 168;
const EMPTY_ROWS = [];

const prefersReducedMotion =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// One formatter instance instead of a new Intl object per label (~3,000 calls per month of data).
const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function formatTime(value) {
  return timeFormatter.format(new Date(value));
}

/* ---------- Chart configuration (module scope = stable references, no needless chart updates) ---------- */

const gradientCache = new WeakMap();

function areaGradient(context) {
  const { chart } = context;
  const { ctx, chartArea } = chart;
  if (!chartArea) return "rgba(37, 99, 235, 0.08)";
  const cached = gradientCache.get(chart);
  if (cached && cached.top === chartArea.top && cached.bottom === chartArea.bottom) return cached.gradient;
  const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  gradient.addColorStop(0, "rgba(37, 99, 235, 0.22)");
  gradient.addColorStop(1, "rgba(37, 99, 235, 0)");
  gradientCache.set(chart, { top: chartArea.top, bottom: chartArea.bottom, gradient });
  return gradient;
}

function chartOptions(title, yAxisTitle = "Power (MW)") {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: prefersReducedMotion ? false : { duration: 450 },
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        display: true,
        labels: { usePointStyle: true, pointStyle: "line", padding: 18, color: "#284765", font: { weight: "600" } },
      },
      title: { display: false, text: title },
      tooltip: {
        backgroundColor: "#173b5f",
        padding: 12,
        cornerRadius: 10,
        boxPadding: 4,
        callbacks: {
          label: (item) =>
            item.parsed.y == null ? `${item.dataset.label}: —` : `${item.dataset.label}: ${item.parsed.y.toFixed(1)} MW`,
        },
      },
    },
    scales: {
      x: {
        ticks: { color: "#6b8196", maxTicksLimit: 8, maxRotation: 0, autoSkipPadding: 16 },
        grid: { color: "rgba(94, 145, 182, 0.1)" },
      },
      y: {
        title: { display: true, text: yAxisTitle, color: "#6b8196" },
        ticks: { color: "#6b8196" },
        grid: { color: "rgba(94, 145, 182, 0.12)" },
        beginAtZero: false,
      },
    },
  };
}

const comparisonOptions = chartOptions("Actual and forecast generation");
const errorOptions = chartOptions("Forecast error over time", "Error (MW)");

/* ---------- Data helpers (unchanged behaviour) ---------- */

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

/* ---------- Presentational pieces ---------- */

const METRIC_HINTS = {
  MAE: "Average absolute miss",
  RMSE: "Penalises large misses",
  Bias: "Forecast − actual",
  "Valid intervals": "Matched 30-min points",
};

// Decorative sky layer: fixed + transform-only animation keeps it off the main thread and out of layout.
const SkyBackground = memo(function SkyBackground() {
  return (
    <div className="sky" aria-hidden="true">
      <span className="cloud cloud-1" />
      <span className="cloud cloud-2" />
      <span className="cloud cloud-3" />
      <span className="streak streak-1" />
      <span className="streak streak-2" />
      <span className="streak streak-3" />
      <span className="streak streak-4" />
      <span className="streak streak-5" />
    </div>
  );
});

function WindGlyph({ className, animated = false }) {
  const flow = animated ? " flow" : "";
  return (
    <svg className={className} viewBox="0 0 48 40" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true" focusable="false">
      <path className={`g1${flow}`} pathLength="100" d="M4 14h27a6.5 6.5 0 1 0-6.5-6.5" />
      <path className={`g2${flow}`} pathLength="100" d="M4 24h36a6.5 6.5 0 1 1-6.5 6.5" />
      <path className={`g3${flow}`} pathLength="100" d="M4 33h15" />
    </svg>
  );
}

const MetricsGrid = memo(function MetricsGrid({ metrics }) {
  return (
    <section className="metrics-grid" aria-label="Forecast accuracy metrics">
      {[["MAE", metrics.mae], ["RMSE", metrics.rmse], ["Bias", metrics.bias], ["Valid intervals", metrics.valid_intervals]].map(([label, value]) => (
        <div className="metric-card" key={label}>
          <span>{label}</span>
          <strong>{value == null ? "—" : typeof value === "number" && label !== "Valid intervals" ? `${value.toFixed(2)} MW` : value}</strong>
          <small>{METRIC_HINTS[label]}</small>
        </div>
      ))}
    </section>
  );
});

const ComparisonChart = memo(function ComparisonChart({ chart }) {
  return <Line data={chart} options={comparisonOptions} role="img" aria-label="Line chart of actual and forecast wind generation in megawatts" />;
});

const ErrorChart = memo(function ErrorChart({ chart }) {
  return <Line data={chart} options={errorOptions} role="img" aria-label="Line chart of forecast error in megawatts over time" />;
});

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

  const data = result?.data || EMPTY_ROWS;
  const selectionStages = result?.quality?.selection_stages;
  const noEligibleForecasts = Boolean(
    selectionStages && selectionStages.horizon_eligible_records === 0,
  );
  const maxAvailableHorizon = selectionStages?.max_day_ahead_lead_hours;

  // Chart datasets only rebuild when the data (or forecast availability) changes,
  // not while the slider or date inputs are being dragged.
  const { comparison, errorChart, errors } = useMemo(() => {
    const chartData = buildChartData(data);
    const dense = chartData.comparison.labels.length > 400;
    const built = {
      ...chartData.comparison,
      datasets: [
        {
          ...chartData.comparison.datasets[0],
          borderColor: "#2563eb",
          backgroundColor: areaGradient,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          fill: "start",
        },
        ...(!noEligibleForecasts ? [{
          ...chartData.comparison.datasets[1],
          borderColor: "#16a34a",
          backgroundColor: "#16a34a",
          borderWidth: 2,
          borderDash: [7, 4],
          pointRadius: dense ? 0 : 2,
          pointHoverRadius: 4,
          spanGaps: true,
        }] : []),
      ],
    };
    return {
      comparison: built,
      errors: chartData.errors,
      errorChart: {
        labels: chartData.errorLabels,
        datasets: [
          {
            label: "Forecast error (forecast - actual)",
            data: chartData.errors,
            borderColor: "#dc2626",
            backgroundColor: "rgba(220, 38, 38, 0.15)",
            borderWidth: 2,
            pointRadius: dense ? 0 : 2,
            pointHoverRadius: 4,
            pointBackgroundColor: "#dc2626",
            fill: "origin",
            tension: 0.15,
          },
          {
            label: "Zero reference",
            data: chartData.errors.map(() => 0),
            borderColor: "#6b7280",
            borderDash: [6, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            pointHoverRadius: 0,
            fill: false,
          },
        ],
      },
    };
  }, [data, noEligibleForecasts]);

  const metrics = noEligibleForecasts ? null : result?.metrics;
  const sliderStyle = { "--fill": `${(horizon / MAX_HORIZON) * 100}%` };

  return (
    <main className="app-shell">
      <SkyBackground />
      <div className="dashboard">
        <header className="hero">
          <div className="brand-mark" aria-hidden="true"><WindGlyph className="brand-glyph" /></div>
          <div className="hero-text">
            <p className="eyebrow">ELEXON • WIND INTELLIGENCE</p>
            <h1>Wind generation <span>forecast monitor</span></h1>
            <p className="hero-copy">A clear view of UK national wind delivery intervals and day-ahead forecast accuracy.</p>
          </div>
        </header>

        <section className="control-card">
          <div className="section-kicker">Explore the forecast</div>
          <div className="controls">
            <label className="field">Start date<input type="date" min="2026-01-01" max="2026-01-31" value={start} onChange={(event) => setStart(event.target.value)} /></label>
            <label className="field">End date<input type="date" min="2026-01-01" max="2026-01-31" value={end} onChange={(event) => setEnd(event.target.value)} /></label>
            <label className="horizon-field">Minimum forecast horizon <strong>{horizon}h</strong><input aria-label="Minimum forecast horizon" type="range" min="0" max={MAX_HORIZON} value={horizon} style={sliderStyle} onChange={(event) => setHorizon(Number(event.target.value))} /><span className="range-labels"><span>0h</span><span>{MAX_HORIZON}h</span></span></label>
            <button className="load-button" type="button" onClick={fetchData} disabled={loading} aria-busy={loading}>
              <span>{loading ? "Loading" : "Load data"}</span>
              {loading ? <WindGlyph className="button-glyph" animated /> : <span aria-hidden="true">→</span>}
            </button>
          </div>
          <p className="assumption"><span aria-hidden="true">◷</span> Latest forecast published by 00:00 UTC on the day before delivery is used.</p>
        </section>

        {error && <p className="notice notice-error" role="alert">{error}</p>}
        {loading && (
          <div className="loading-card" aria-live="polite">
            <WindGlyph className="loading-glyph" animated />
            <div><strong>Reading the wind...</strong><span>Loading Elexon actuals and forecasts</span></div>
            <span className="loading-bar" aria-hidden="true" />
          </div>
        )}
        {loading && !result && <div className="skeleton-card" aria-hidden="true"><span className="skeleton-line" /><span className="skeleton-block" /></div>}
        {!loading && !result && !error && (
          <div className="empty-card">
            <WindGlyph className="empty-glyph" />
            <div><strong>Ready when you are</strong><span>Choose a date range and minimum horizon, then press Load data.</span></div>
          </div>
        )}
        {result && data.length === 0 && <p className="notice">No actual intervals were returned for this date range.</p>}
        {noEligibleForecasts && (
          <p className="notice notice-warning" role="status">
            No forecast data is available for the selected {horizon}h minimum horizon.
            The maximum available day-ahead horizon is {maxAvailableHorizon == null ? "unknown" : `${maxAvailableHorizon.toFixed(1)}h`}.
            Actual generation remains visible; forecast comparisons and metrics are hidden.
          </p>
        )}

        <div className={loading ? "results is-refreshing" : "results"} aria-busy={loading}>
          {metrics && <MetricsGrid metrics={metrics} />}

          {data.length > 0 && (
            <>
              <section className="chart-card" aria-label={noEligibleForecasts ? "Actual generation chart" : "Actual and forecast generation chart"}>
                <div className="chart-heading">
                  <div><span className="section-kicker">Generation profile</span><h2>{noEligibleForecasts ? "Actual generation" : "Actual vs forecast generation"}</h2></div>
                  <div className="pill-row">
                    {noEligibleForecasts && <span className="unit-pill warn-pill">Forecast hidden</span>}
                    <span className="unit-pill">MW • 30 min intervals</span>
                  </div>
                </div>
                <div className="chart-wrap"><ComparisonChart chart={comparison} /></div>
              </section>
              {!noEligibleForecasts && errors.length > 0 ? (
                <section className="chart-card error-card" aria-label="Forecast error chart">
                  <div className="chart-heading"><div><span className="section-kicker error-kicker">Accuracy signal</span><h2>Forecast error over time</h2><p>Error = forecast minus actual (MW).</p></div><span className="unit-pill error-pill">± MW</span></div>
                  <div className="chart-wrap error-chart-wrap"><ErrorChart chart={errorChart} /></div>
                </section>
              ) : (
                <p className="notice">No matched actual and forecast intervals are available for the selected range.</p>
              )}
            </>
          )}
        </div>
        <footer className="footer">Wind forecast monitor <span>•</span> Data from Elexon BMRS</footer>
      </div>
    </main>
  );
}

export default App;