<div align="center">

<pre>
██╗    ██╗██╗   ██╗███╗   ██╗██████╗ ██████╗  █████╗ 
██║    ██║╚██╗ ██╔╝████╗  ██║██╔══██╗██╔══██╗██╔══██╗
██║ █╗ ██║ ╚████╔╝ ██╔██╗ ██║██║  ██║██████╔╝███████║
██║███╗██║  ╚██╔╝  ██║╚██╗██║██║  ██║██╔══██╗██╔══██║
╚███╔███╔╝   ██║   ██║ ╚████║██████╔╝██║  ██║██║  ██║
 ╚══╝╚══╝    ╚═╝   ╚═╝  ╚═══╝╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝
</pre>

### `[ WIND GENERATION FORECAST MONITOR ]`

`ACTUAL vs FORECAST :: UK WIND :: ELEXON :: JANUARY 2026`

</div>

---

Wyndra compares actual UK wind generation with Elexon forecasts to evaluate forecast accuracy for January 2026.

## Live Demo

- **Frontend:** [wyndra-liard.vercel.app](https://wyndra-liard.vercel.app/)
- **Backend API:** [wyndra.onrender.com](https://wyndra.onrender.com/)

## Features

- Actual vs. forecast generation charts
- Date range and minimum forecast horizon filters
- MAE, RMSE, bias, and valid interval metrics
- UTC timestamp matching and day-ahead cutoff
- Responsive sky-themed dashboard

## Tech Stack

React, Python, FastAPI, Elexon API, Docker.

## Project Structure

```
backend/    FastAPI, data processing, tests, Dockerfile
frontend/   React dashboard, charts, tests, Dockerfile
docker-compose.yml
```

## Run Locally

**Requirements:** Python, Node.js, and Docker (optional).

```bash
# Backend
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload
```

```bash
# Frontend - in a separate terminal
cd frontend
npm install
npm start
```

## Run with Docker

From the project root:

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend: http://localhost:8000

## Tests

```bash
cd backend
python -m pytest -q
```

```bash
cd frontend
npm test -- --watchAll=false --runInBand
npm run build
```

## Data and Method

- **FUELHH:** Actual wind generation (`fuelType=WIND`).
- **WINDFOR:** Forecast wind generation.
- Records are matched by UTC `startTime`.
- Forecasts must meet the day-ahead publication cutoff and selected minimum horizon.
- MAE, RMSE, and bias use matched records with valid numeric values.
- Missing forecasts are not fabricated.

## Demo Video

[Watch the demo](https://youtu.be/6VKA-zeY0AU)

## AI Disclosure

AI tools were used to assist with code inspection, implementation, testing, and validation. No database or machine-learning model is used.