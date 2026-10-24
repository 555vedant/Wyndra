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
