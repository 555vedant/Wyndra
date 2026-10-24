# Wind Generation Forecast Monitor

React frontend and FastAPI backend for comparing Elexon UK national wind
generation actuals with day-ahead forecasts for January 2026.

## Data and matching

- Actuals come from Elexon `FUELHH`, filtered to `fuelType=WIND`.
- Forecasts come from Elexon `WINDFOR`.
- Records are matched by the same `startTime`, normalized to UTC.
- Invalid values and duplicate timestamps are discarded.
- For each delivery interval, the selected vintage is the latest forecast
  whose `publishTime` is no later than `00:00 UTC on the day before delivery`.
  This cutoff is an explicit assumption because the assignment does not specify
  a more precise purchase-decision time.
- MAE, RMSE, bias (`forecast - actual`), and valid intervals use only matched
  rows with both numeric values.

The horizon control supports 0–168 hours. A selected forecast must satisfy both
the day-ahead cutoff and the minimum lead-time rule:
`publishTime <= startTime - horizon`. The forecast publication request searches
far enough back for the selected horizon. Elexon may not provide a vintage for
every interval at higher horizons, so valid intervals can decrease; unmatched
actual intervals remain visible with a missing forecast and are not fabricated
or included in metrics.

## Structure

```text
backend/
  data_fetcher.py
  forecast_selector.py
  main.py
  test_forecast_logic.py
  requirements.txt
  Dockerfile
frontend/
  src/App.js
  src/App.test.js
  Dockerfile
docker-compose.yml
```

## Local setup

Backend:

```powershell
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload
```

Frontend:

```powershell
cd frontend
npm install
npm start
```

The frontend defaults to `https://wyndra.onrender.com`. Set
`REACT_APP_API_URL` to override the backend URL, for example when running
against a local backend.

## Docker

```powershell
docker compose up --build
```

The frontend is available on port 3000 and the backend on port 8000.

## Tests and build

```powershell
cd backend
python -m pytest -q

cd ..\frontend
npm test -- --watchAll=false --runInBand
npm run build
```

## Deployment

The existing sample deployments are:

- Frontend: https://wind-forecast-app-sigma.vercel.app/
- Backend: https://wyndra.onrender.com
- Demo: https://youtu.be/6VKA-zeY0AU

After code changes, redeploy both services and verify the frontend
`REACT_APP_API_URL` points to the updated backend. Deployment and private-window
URL checks remain manual.

## AI disclosure

AI tools were used to inspect the repository, implement focused fixes, create
tests, and validate the application. No database or machine-learning model is
used.