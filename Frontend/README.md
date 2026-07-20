# p-Adic Ultrametric Vector Search Engine — Frontend

Next.js 14 (App Router) + TypeScript + Tailwind dashboard for a GPU-accelerated
p-Adic ultrametric nearest-neighbor search engine. Talks to a FastAPI backend
over REST (see `src/lib/api.ts`); falls back to local mock data whenever the
backend is unreachable, so the UI runs standalone during frontend development.

## Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout, fonts, dark theme
│   │   └── page.tsx            # Main dashboard page (header + 3-pane body + bottom panel)
│   ├── components/
│   │   ├── SearchPanel.tsx             # Query vector input + search config, calls the backend
│   │   ├── MetricsDashboard.tsx        # Top-K table, live perf cards, log/profiler/bank panels
│   │   └── UltrametricTreeVisualizer.tsx # D3-driven dendrogram + KaTeX math overlays
│   ├── lib/
│   │   └── api.ts              # Axios wrappers for the FastAPI backend
│   └── styles/
│       └── globals.css         # Tailwind + cyberpunk/GPU base styles
├── public/
│   └── logo.svg
├── package.json
├── tailwind.config.js
└── tsconfig.json
```

## Getting started

```bash
npm install
cp .env.example .env.local   # point NEXT_PUBLIC_API_BASE_URL at your FastAPI backend
npm run dev
```

Open http://localhost:3000. The window is designed for desktops ≥ 1400×900
(HPC/engineering workstation use case), matching the fixed panel widths in
the design brief (60px header, 320px left sidebar, 400px right sidebar,
200px bottom panel).

## Backend contract

`src/lib/api.ts` expects a FastAPI backend exposing:

- `POST /api/search` — body `{ vector: number[], config: SearchConfig }` → `SearchResponse`
- `GET /api/metrics` — → `MetricsSnapshot` (latency, throughput, kernel breakdown, memory, dataset)
- `GET /api/logs?limit=` — → `LogEntry[]`
- `POST /api/vectors/upload` — multipart file → `{ vector: number[] }`

All response shapes are typed in `src/lib/api.ts`. If any endpoint is
unavailable, the corresponding function returns realistic mock data instead
of throwing, so the dashboard stays interactive.
