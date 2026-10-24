import { fireEvent, render, screen } from "@testing-library/react";
jest.mock("axios", () => ({ get: jest.fn() }));
jest.mock("react-chartjs-2", () => ({ Line: () => null }));
import App, { buildChartData, normaliseResponse } from "./App";
import axios from "axios";

test("shows January 2026 controls and the load action", () => {
  render(<App />);
  expect(screen.getByText(/January 2026/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /load data/i })).toBeInTheDocument();
});

test("shows calculated metrics after loading matched intervals", async () => {
  axios.get.mockResolvedValue({
    data: [
      { time: "2026-01-01T00:00:00Z", actual: 100, forecast: 110 },
      { time: "2026-01-01T00:30:00Z", actual: 120, forecast: 100 },
    ],
  });
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: /load data/i }));

  expect(await screen.findByText("15.00 MW")).toBeInTheDocument();
  expect(screen.getByText("2")).toBeInTheDocument();
});

test("keeps actual and forecast aligned by UTC time and calculates forecast minus actual", () => {
  const result = normaliseResponse({
    data: [
      { time: "2026-01-01T02:00:00+01:00", actual: "100", forecast: "120" },
      { time: "2026-01-01T00:00:00Z", actual: 90, forecast: null },
    ],
  });
  const chart = buildChartData(result.data);

  expect(chart.comparison.datasets[0].data).toEqual([90, 100]);
  expect(chart.comparison.datasets[1].data).toEqual([null, 120]);
  expect(chart.errors).toEqual([20]);
});

test("passes the latest horizon slider value when loading data", async () => {
  axios.get.mockResolvedValue({ data: { data: [], metrics: { valid_intervals: 0 } } });
  render(<App />);

  fireEvent.change(screen.getByRole("slider"), { target: { value: "107" } });
  fireEvent.click(screen.getByRole("button", { name: /load data/i }));

  await screen.findByText(/No actual intervals/i);
  expect(axios.get).toHaveBeenLastCalledWith(
    expect.stringContaining("/wind-data"),
    expect.objectContaining({ params: { start: "2026-01-01", end: "2026-01-31", horizon: 107 } }),
  );
});

test("keeps actuals visible and hides forecast KPIs when no horizon is eligible", async () => {
  axios.get.mockResolvedValue({
    data: {
      data: [{ time: "2026-01-01T00:00:00Z", actual: 100, forecast: null }],
      metrics: { mae: null, rmse: null, bias: null, valid_intervals: 0 },
      quality: {
        selection_stages: {
          horizon_eligible_records: 0,
          max_day_ahead_lead_hours: 66.5,
        },
      },
    },
  });
  render(<App />);
  fireEvent.change(screen.getByRole("slider"), { target: { value: "107" } });
  fireEvent.click(screen.getByRole("button", { name: /load data/i }));

  expect(await screen.findByRole("status")).toHaveTextContent("maximum available day-ahead horizon is 66.5h");
  expect(screen.getByRole("heading", { name: "Actual generation" })).toBeInTheDocument();
  expect(screen.queryByLabelText("Forecast accuracy metrics")).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Forecast error over time" })).not.toBeInTheDocument();
});
