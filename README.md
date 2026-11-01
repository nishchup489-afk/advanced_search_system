# SearchLab

**A hands-on PostgreSQL search engineering lab.** Build the same product search five different ways, inspect the SQL and query plans, and see how full-text indexing, typo tolerance, and caching change its behavior.

[**Live demo**](https://advanced-search-system.vercel.app/) · [**Technical walkthroughs**](https://advanced-search-system.vercel.app/docs/) · [**Source code**](https://github.com/nishchup489-afk/advanced_search_system)

> **Live demo:** The API is hosted on a Render service that can sleep when idle. The first search after inactivity may take **around 50 seconds** to respond. Subsequent requests should be quicker. For a more reliable experience, [run the project locally](#run-locally).

## Search evolution

| Version | Approach | What it demonstrates |
| --- | --- | --- |
| [V1](https://advanced-search-system.vercel.app/v1/v1.html) | `ILIKE` | A simple substring-matching baseline |
| [V2](https://advanced-search-system.vercel.app/v2/v2.html) | PostgreSQL full-text search | Weighted `tsvector`, `websearch_to_tsquery`, and relevance ranking |
| [V3](https://advanced-search-system.vercel.app/v3/v3.html) | Persisted search vector + GIN | Index-backed full-text retrieval maintained by a trigger |
| [V4](https://advanced-search-system.vercel.app/v4/v4.html) | `pg_trgm` fuzzy search | Typo-tolerant matching using trigram similarity |
| [V5](https://advanced-search-system.vercel.app/v5/v5.html) | Full-text + fuzzy fallback + Redis | Cache hits can bypass PostgreSQL |

Each version has its own interactive UI, results, measurements, SQL, and PostgreSQL execution-plan inspection. The home page also has a **V1–V5 comparison** that runs the same query through every implemented version.

## Stack

- **Backend:** Python 3.14+, FastAPI, Psycopg 3, raw PostgreSQL SQL
- **Database:** PostgreSQL with full-text search, GIN indexing, and `pg_trgm`
- **Cache:** Redis (V5, with a five-minute result TTL)
- **Frontend:** Vanilla HTML, CSS, and JavaScript
- **Demo hosting:** Vercel frontend and Render API

The dataset consists of **synthetic products** generated with Faker; the default seed size is 100,000 rows. This is an educational engineering project, not a commercial product catalog.

## Run locally

Local runs use **your own PostgreSQL database, Redis instance, and seed data**. Cloning the repository alone does not copy the hosted database.

### Prerequisites

- Python **3.14 or newer**, [uv](https://docs.astral.sh/uv/), and Git
- PostgreSQL with the `psql` and `createdb` commands available
- Redis running on `localhost:6379` (required for V5 caching)
- A browser and a local HTTP server (Python's built-in server is enough)

### 1. Clone and configure

```bash
git clone https://github.com/nishchup489-afk/advanced_search_system.git
cd advanced_search_system
cp backend/.env.example backend/.env
```

On Windows PowerShell, use `Copy-Item backend/.env.example backend/.env` instead of `cp` if needed.

Edit `backend/.env` to match your local PostgreSQL credentials and Redis instance:

```dotenv
DATABASE_URL=postgresql://YOUR_USER:YOUR_PASSWORD@localhost:5432/searchlab
REDIS_URL=redis://localhost:6379
```

Do not commit your `.env` file or real credentials.

### 2. Create and prepare the database

With PostgreSQL running, from the repository root:

```bash
createdb searchlab
psql -d searchlab -v ON_ERROR_STOP=1 -f backend/sql/schema.sql
psql -d searchlab -v ON_ERROR_STOP=1 -f backend/sql/search_setup.sql
```

The second script configures the persisted weighted `search_vector`, its maintenance trigger, the GIN index, and the `pg_trgm` extension/index used by the later versions. It can be rerun safely. Use `psql -U YOUR_USER ...` if your database requires an explicit username.

### 3. Install dependencies, seed data, and start the API

```bash
cd backend
uv sync
uv run python scripts/seed.py --count 100000
uv run uvicorn advanced_search_system.main:app --reload --host 127.0.0.1 --port 8000
```

The seed command adds records each time it runs; don't rerun it unless you want more products. For a lighter development dataset, change `--count` to `10000`. Seeding happens **after** the search-vector trigger is installed, so the indexed vector is populated automatically. For a large seed, run `ANALYZE products;` in `psql` afterward to refresh query-planner statistics.

Check the API at [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health) or view its interactive [Swagger docs](http://127.0.0.1:8000/docs).

### 4. Serve the frontend

Open a **second terminal** at the repository root:

```bash
cd frontend
python -m http.server 8765
```

Then visit **[http://127.0.0.1:8765](http://127.0.0.1:8765)**. When served from `localhost` or `127.0.0.1`, the frontend automatically targets `http://127.0.0.1:8000` rather than the hosted Render API.

Keep PostgreSQL, Redis, the FastAPI server, and the frontend HTTP server running while testing.

## API

All five versions expose a GET endpoint:

```http
GET /api/v1/search?q=wireless%20keyboard
GET /api/v2/search?q=wireless%20keyboard
GET /api/v3/search?q=wireless%20keyboard
GET /api/v4/search?q=wireless%20keyboard
GET /api/v5/search?q=wireless%20keyboard
```

For a local API request:

```bash
curl "http://127.0.0.1:8000/api/v5/search?q=mechanical%20keyboard"
```

V2–V5 support `limit` and `offset` query parameters (V1 is a baseline without pagination). Responses include search results and diagnostic information; fields vary by version.

## Project structure

```text
backend/
  scripts/seed.py          Synthetic product data generator
  sql/                     Base schema and local search setup
  src/advanced_search_system/
    api/                   Versioned FastAPI routes
    search/v1..v5/         Search implementations
    db/                    PostgreSQL connection
    cache/                 Redis client
frontend/
  index.html               Home and benchmark comparison
  v1/ ... v5/              Individual search interfaces
  docs/                    Interactive technical documentation
  scripts/                 Shared UI and API configuration
docs/                      Full engineering write-ups for V1–V5
```

## About the benchmarks

SearchLab exposes application timing, PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` plans, and other per-version diagnostics to make query behavior visible. **These are educational comparisons, not controlled production benchmarks.** Query-plan inspection can execute SQL again, V5's home-page comparison deliberately warms the cache, and network/Render cold-start latency is separate from backend execution measurements.

For meaningful comparisons, run locally with the same dataset, warm the services first, and repeat queries. The detailed design and SQL explanations are in [the project docs](https://advanced-search-system.vercel.app/docs/).
