# V5 Implementation Guide

If you want to reproduce your **V5 architecture in another project**, treat it as a repeatable migration from:

```text
normal PostgreSQL table
        ↓
Full-Text Search
        ↓
persisted search_vector
        ↓
GIN index
        ↓
pg_trgm typo fallback
        ↓
Redis cache-aside
```

Below is the order I would follow in a real project.

## 1. Start with a normal searchable table

Assume another application has something like:

```sql
CREATE TABLE products (
    id BIGSERIAL PRIMARY KEY,

    name TEXT NOT NULL,
    description TEXT,
    brand TEXT,
    category TEXT,
    tags TEXT[],

    price NUMERIC(10, 2),
    stock INTEGER,

    created_at TIMESTAMPTZ
        DEFAULT CURRENT_TIMESTAMP
);
```

The searchable fields are:

```text
name
brand
category
tags
description
```

Before touching Redis, build a correct PostgreSQL search engine first.

---

## 2. Enable `pg_trgm`

You don't normally "download" `pg_trgm` inside PostgreSQL.

It is a PostgreSQL extension.

Run:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

Verify:

```sql
SELECT extname
FROM pg_extension
WHERE extname = 'pg_trgm';
```

Expected:

```text
pg_trgm
```

Test:

```sql
SELECT similarity(
    'logitech',
    'logtech'
);
```

For managed PostgreSQL providers like Neon, Supabase, RDS, etc., `CREATE EXTENSION` is normally the relevant step if the provider supports it.

For a locally installed PostgreSQL server, you may need PostgreSQL's contrib/extensions package installed at the OS level first.

---

## 3. Add the persisted `search_vector`

Add:

```sql
ALTER TABLE products
ADD COLUMN search_vector tsvector;
```

This column will contain the preprocessed searchable representation.

Conceptually:

```text
name
brand
category
tags
description
        ↓
tokenization
stemming
lexemes
weights
        ↓
search_vector
```

---

## 4. Decide field weights

For example:

```text
A → name
B → brand
B → category
C → tags
D → description
```

Meaning:

```text
name match
>
brand/category match
>
tag match
>
description match
```

These don't control whether something matches.

They influence ranking.

---

## 5. Create the trigger function

Now create the database function responsible for maintaining `search_vector`:

```sql
CREATE OR REPLACE FUNCTION update_product_search_vector()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN

    NEW.search_vector :=

        setweight(
            to_tsvector(
                'english',
                COALESCE(NEW.name, '')
            ),
            'A'
        )

        ||

        setweight(
            to_tsvector(
                'english',
                COALESCE(NEW.brand, '')
            ),
            'B'
        )

        ||

        setweight(
            to_tsvector(
                'english',
                COALESCE(NEW.category, '')
            ),
            'B'
        )

        ||

        setweight(
            to_tsvector(
                'english',
                COALESCE(
                    array_to_string(
                        NEW.tags,
                        ' '
                    ),
                    ''
                )
            ),
            'C'
        )

        ||

        setweight(
            to_tsvector(
                'english',
                COALESCE(
                    NEW.description,
                    ''
                )
            ),
            'D'
        );

    RETURN NEW;

END;
$$;
```

The important object here is:

```sql
NEW
```

Inside a row trigger:

```text
NEW.name
NEW.brand
NEW.description
```

represent the row PostgreSQL is about to store.

---

## 6. Create the trigger

Now tell PostgreSQL when that function should execute:

```sql
CREATE TRIGGER products_search_vector_trigger

BEFORE INSERT OR UPDATE OF
    name,
    brand,
    category,
    tags,
    description

ON products

FOR EACH ROW

EXECUTE FUNCTION update_product_search_vector();
```

Now this:

```sql
UPDATE products
SET stock = 20
WHERE id = 5;
```

doesn't need to rebuild the vector.

But:

```sql
UPDATE products
SET name = 'Logitech MX Keyboard'
WHERE id = 5;
```

does.

The write path becomes:

```text
INSERT / UPDATE
      ↓
BEFORE trigger
      ↓
update_product_search_vector()
      ↓
NEW.search_vector generated
      ↓
row stored
```

---

## 7. Backfill existing data

The trigger only protects future writes.

Existing rows still have:

```text
search_vector = NULL
```

So backfill them:

```sql
UPDATE products

SET search_vector =

    setweight(
        to_tsvector(
            'english',
            COALESCE(name, '')
        ),
        'A'
    )

    ||

    setweight(
        to_tsvector(
            'english',
            COALESCE(brand, '')
        ),
        'B'
    )

    ||

    setweight(
        to_tsvector(
            'english',
            COALESCE(category, '')
        ),
        'B'
    )

    ||

    setweight(
        to_tsvector(
            'english',
            COALESCE(
                array_to_string(
                    tags,
                    ' '
                ),
                ''
            )
        ),
        'C'
    )

    ||

    setweight(
        to_tsvector(
            'english',
            COALESCE(description, '')
        ),
        'D'
    );
```

Verify:

```sql
SELECT COUNT(*)
FROM products
WHERE search_vector IS NULL;
```

Expected:

```text
0
```

---

## 8. Create the FTS GIN index

Now index the persisted vector:

```sql
CREATE INDEX idx_products_search_vector
ON products
USING GIN (
    search_vector
);
```

Then:

```sql
ANALYZE products;
```

Now PostgreSQL has an efficient candidate-retrieval structure for:

```sql
search_vector @@ tsquery
```

Mental model:

```text
without GIN

products
products
products
products
products
 ↓
scan


with GIN

query lexemes
    ↓
GIN
    ↓
candidate row locations
```

GIN finds candidates.

It does **not** perform the final ranking.

---

## 9. Write the primary Full-Text Search query

Your primary search becomes:

```sql
WITH search_input AS (

    SELECT websearch_to_tsquery(
        'english',
        %s
    ) AS query

)

SELECT
    p.id,
    p.name,
    p.description,
    p.brand,
    p.category,
    p.tags,
    p.price,
    p.stock,
    p.created_at,

    ts_rank_cd(
        p.search_vector,
        q.query
    ) AS rank,

    ts_headline(
        'english',
        COALESCE(p.description, ''),
        q.query,
        'StartSel=<mark>, StopSel=</mark>, MaxWords=30, MinWords=10'
    ) AS headline

FROM products AS p

CROSS JOIN search_input AS q

WHERE
    p.search_vector @@ q.query

ORDER BY
    rank DESC,
    p.id ASC;
```

This becomes your **primary retrieval strategy**.

---

## 10. Test that PostgreSQL actually uses the index

Run:

```sql
EXPLAIN (
    ANALYZE,
    BUFFERS
)

WITH search_input AS (
    SELECT websearch_to_tsquery(
        'english',
        'mechanical keyboard'
    ) AS query
)

SELECT
    p.id

FROM products AS p

CROSS JOIN search_input AS q

WHERE
    p.search_vector @@ q.query;
```

For a sufficiently selective query, you may see something like:

```text
Bitmap Index Scan
    ↓
Bitmap Heap Scan
```

possibly involving:

```text
idx_products_search_vector
```

Don't panic if PostgreSQL occasionally chooses:

```text
Sequential Scan
```

for very broad queries.

The planner chooses what it estimates is cheapest.

---

## 11. Add fuzzy typo recovery

FTS won't necessarily understand:

```text
logtech
```

as:

```text
logitech
```

So now build your fallback query:

```sql
WITH search_input AS (
    SELECT %s::text AS query
)

SELECT
    p.id,
    p.name,
    p.description,
    p.brand,
    p.category,
    p.tags,
    p.price,
    p.stock,
    p.created_at,

    GREATEST(

        similarity(
            p.name,
            q.query
        ),

        similarity(
            COALESCE(p.brand, ''),
            q.query
        ),

        similarity(
            COALESCE(p.category, ''),
            q.query
        )

    ) AS fuzzy_score

FROM products AS p

CROSS JOIN search_input AS q

WHERE
       p.name % q.query
    OR COALESCE(p.brand, '') % q.query
    OR COALESCE(p.category, '') % q.query

ORDER BY
    fuzzy_score DESC,
    p.id ASC;
```

In a Psycopg SQL string, because `%s` is used for parameter placeholders, you may write the trigram operator as:

```python
p.name %% q.query
```

depending on how the SQL is passed through Psycopg.

---

## 12. Understand the V4/V5 search decision

Don't run both queries unnecessarily.

Do:

```python
fts_rows = run_fts(query)

if fts_rows:
    return fts_rows

return run_fuzzy(query)
```

Architecture:

```text
query
 ↓
FTS
 ↓
results?
 ├── yes
 │    ↓
 │  return
 │
 └── no
      ↓
   pg_trgm
      ↓
   return
```

So FTS remains your real search engine.

Trigram search is recovery.

---

## 13. Optionally add trigram indexes

This is separate from the FTS GIN index.

For example:

```sql
CREATE INDEX idx_products_name_trgm
ON products
USING GIN (
    name gin_trgm_ops
);
```

Brand:

```sql
CREATE INDEX idx_products_brand_trgm
ON products
USING GIN (
    brand gin_trgm_ops
);
```

Category:

```sql
CREATE INDEX idx_products_category_trgm
ON products
USING GIN (
    category gin_trgm_ops
);
```

Then:

```sql
ANALYZE products;
```

Important:

```text
FTS GIN
```

and:

```text
trigram GIN
```

are **not the same index**.

FTS index:

```sql
search_vector
```

with FTS operators.

Trigram indexes:

```sql
name gin_trgm_ops
```

with trigram operators.

I'd only create these once you have measured that your fuzzy fallback is actually expensive.

---

## 14. Install Redis Python client

Now PostgreSQL search is complete.

Only now add caching:

```bash
uv add redis
```

or with pip:

```bash
pip install redis
```

Redis is not part of PostgreSQL.

It is a separate service.

Locally:

```text
Redis
→ localhost:6379
```

Production could be:

```text
Upstash
Redis Cloud
AWS ElastiCache
Azure Cache for Redis-compatible services
self-hosted Redis
```

---

## 15. Add Redis configuration

`.env`:

```env
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379
```

Production with TLS may look like:

```env
REDIS_URL=rediss://default:PASSWORD@HOST:6379
```

Pydantic:

```python
from pydantic_settings import (
    BaseSettings,
    SettingsConfigDict,
)


class Settings(BaseSettings):

    database_url: str

    redis_url: str = (
        "redis://localhost:6379"
    )

    model_config = SettingsConfigDict(
        env_file=".env",
    )


settings = Settings()
```

---

## 16. Create a reusable Redis client

For example:

```text
advanced_search_system/
└── cache/
    ├── __init__.py
    └── client.py
```

`client.py`:

```python
import redis

from advanced_search_system.config import settings


redis_client = redis.from_url(
    settings.redis_url,
    decode_responses=True,
)
```

You generally reuse this client.

Don't create:

```python
redis.from_url(...)
```

for every search request.

---

## 17. Normalize the cache key

For simple searches:

```python
def normalize_query(
    query: str,
) -> str:

    return " ".join(
        query.lower().split()
    )
```

Then:

```text
"  Logitech   Keyboard "
```

becomes:

```text
"logitech keyboard"
```

Be conservative here.

If you support operators like:

```text
"gaming keyboard"
apple OR samsung
mouse -wireless
```

don't aggressively remove punctuation/operators because those can alter `websearch_to_tsquery()` semantics.

---

## 18. Build a versioned cache key

A good reusable pattern:

```python
import hashlib


def build_cache_key(
    query: str,
) -> str:

    digest = hashlib.sha256(
        query.encode("utf-8")
    ).hexdigest()

    return (
        f"search:v1:{digest}"
    )
```

Why version it?

Because one day you change your ranking algorithm.

Then:

```text
search:v1:...
```

and:

```text
search:v2:...
```

don't contaminate each other.

For your current project you used:

```text
search:v5:...
```

because V5 identifies your implementation version.

In another app, call it something like:

```text
search:products:v1:
```

---

## 19. Cache every response-shaping parameter

This is extremely important.

Suppose your endpoint becomes:

```text
/search
?q=keyboard
&category=gaming
&sort=price
&page=2
&limit=20
```

Then your cache key cannot only contain:

```text
keyboard
```

Otherwise different filters could return the wrong cached response.

A mature key could derive from:

```python
payload = (
    f"{query}|"
    f"{category}|"
    f"{sort}|"
    f"{page}|"
    f"{limit}"
)
```

and hash that.

Rule:

> Every input that can change the response must participate in the cache key.

---

## 20. Implement cache-aside

This is the central V5 algorithm:

```python
def search_products(
    query: str,
):

    normalized = normalize_query(
        query
    )

    cache_key = build_cache_key(
        normalized
    )


    # 1. CHECK CACHE

    cached = redis_client.get(
        cache_key
    )

    if cached is not None:

        return json.loads(
            cached
        )


    # 2. PRIMARY SEARCH

    rows = run_fts_search(
        normalized
    )


    # 3. FUZZY FALLBACK

    if rows:

        strategy = "full_text"

    else:

        rows = run_fuzzy_search(
            normalized
        )

        strategy = "fuzzy_fallback"


    # 4. BUILD RESPONSE

    result = {
        "strategy": strategy,
        "count": len(rows),
        "results": rows,
    }


    # 5. CACHE

    redis_client.set(
        cache_key,
        json.dumps(result),
        ex=300,
    )


    return result
```

This is called:

```text
cache-aside
```

---

## 21. Make DB results JSON-safe

Psycopg may return:

```text
Decimal
datetime
```

which plain `json.dumps()` doesn't necessarily handle.

With FastAPI:

```python
from fastapi.encoders import (
    jsonable_encoder,
)
```

Then:

```python
safe_result = jsonable_encoder(
    result
)
```

and:

```python
redis_client.set(
    cache_key,
    json.dumps(safe_result),
    ex=300,
)
```

---

## 22. Use TTL

For example:

```python
CACHE_TTL_SECONDS = 300
```

Then:

```python
redis_client.set(
    cache_key,
    serialized_result,
    ex=CACHE_TTL_SECONDS,
)
```

Meaning:

```text
300 seconds
=
5 minutes
```

After five minutes:

```text
key expires
 ↓
next request misses
 ↓
PostgreSQL recomputes
 ↓
new result cached
```

This is your basic stale-data protection.

---

## 23. Redis should fail open

This is one of the most important production principles.

Don't do:

```text
Redis down
↓
search down
```

Do:

```text
Redis down
↓
skip cache
↓
PostgreSQL search
↓
user still gets results
```

Example:

```python
from redis.exceptions import (
    RedisError,
)


def read_cache(
    key: str,
):

    try:

        return redis_client.get(
            key
        )

    except RedisError:

        return None
```

Likewise for writes:

```python
def write_cache(
    key: str,
    value: str,
):

    try:

        redis_client.set(
            key,
            value,
            ex=300,
        )

    except RedisError:

        pass
```

Because:

```text
PostgreSQL
=
source of truth

Redis
=
optimization
```

---

## 24. Don't run `EXPLAIN ANALYZE` on a cache hit

For your learning UI, this matters.

Cache hit:

```text
Redis GET
 ↓
HIT
 ↓
return
```

That means:

```text
database.executed = false
```

If you then run:

```sql
EXPLAIN ANALYZE ...
```

you just touched PostgreSQL and executed the search anyway.

So:

```python
if cache_hit:
    query_plan = None
```

Only inspect plans on database execution paths.

---

## 25. Keep diagnostics separate from cached data

Cache this:

```json
{
    "strategy": "full_text",
    "count": 20,
    "results": []
}
```

Don't blindly cache:

```text
current application latency
tracemalloc values
Redis lookup time
current EXPLAIN plan
request-specific database timing
```

Those belong to the request that generated them.

Not future requests.

---

## 26. Wrap it in FastAPI

Router:

```python
from fastapi import (
    APIRouter,
    Query,
)

from myapp.search.search import (
    search_products,
)


router = APIRouter(
    prefix="/api/search",
    tags=["Search"],
)


@router.get("")
def search(
    q: str = Query(
        ...,
        min_length=1,
        max_length=200,
    ),
):

    return search_products(
        q.strip()
    )
```

Then in:

```python
main.py
```

```python
from fastapi import FastAPI

from myapp.api.search import (
    router as search_router,
)


app = FastAPI()

app.include_router(
    search_router
)
```

---

## 27. In a serious project, put all DB changes in migrations

Don't manually run random SQL against production every time.

With Alembic, one migration could contain:

```python
op.execute("""
CREATE EXTENSION IF NOT EXISTS pg_trgm;
""")
```

then:

```python
op.execute("""
ALTER TABLE products
ADD COLUMN search_vector tsvector;
""")
```

then your function:

```python
op.execute("""
CREATE OR REPLACE FUNCTION ...
""")
```

then trigger:

```python
op.execute("""
CREATE TRIGGER ...
""")
```

then backfill:

```python
op.execute("""
UPDATE products
SET search_vector = ...
""")
```

then:

```python
op.execute("""
CREATE INDEX idx_products_search_vector
ON products
USING GIN(search_vector);
""")
```

That's how I'd move this architecture into a normal SQLAlchemy application.

SQLAlchemy handles:

```text
models
queries
transactions
application data
```

while PostgreSQL-specific things like:

```text
extensions
triggers
GIN operator classes
database functions
```

fit naturally into Alembic migrations using explicit SQL.

---

## 28. The reusable installation order

For any future project, remember this exact sequence:

```text
1. Identify searchable fields

2. Enable pg_trgm

3. Add search_vector tsvector

4. Create trigger function

5. Create trigger

6. Backfill existing rows

7. Verify search_vector IS NOT NULL

8. Create FTS GIN index

9. ANALYZE table

10. Build FTS query

11. EXPLAIN ANALYZE it

12. Build pg_trgm fallback

13. Add trigram indexes only if measurements justify them

14. Install Redis client

15. Configure REDIS_URL

16. Create reusable Redis client

17. Define cache key

18. Implement cache-aside

19. Add TTL

20. Make Redis fail open

21. Keep PostgreSQL as source of truth

22. Include every filter/page/sort option in the cache key

23. Benchmark cache miss vs cache hit
```

And the final architecture is:

```text
                        Request
                           │
                           ▼
                    normalize query
                           │
                           ▼
                    build cache key
                           │
                           ▼
                         Redis
                       GET key
                        /    \
                     HIT      MISS
                      │         │
                      │         ▼
                      │   websearch_to_tsquery()
                      │         │
                      │         ▼
                      │    search_vector
                      │         │
                      │         ▼
                      │       GIN
                      │         │
                      │         ▼
                      │      matches?
                      │      /     \
                      │    yes      no
                      │     │        │
                      │     │        ▼
                      │     │     pg_trgm
                      │     │        │
                      │     │   similarity()
                      │     │        │
                      │     └────┬───┘
                      │          │
                      │          ▼
                      │       results
                      │          │
                      │          ▼
                      │      Redis SET
                      │        + TTL
                      │          │
                      └──────┬───┘
                             ▼
                          response
```

The most transferable lesson is that **you don't “install V5.”** You build four layers independently:

```text
search semantics
      ↓
search indexing
      ↓
fuzzy recovery
      ↓
result caching
```

Once you can reproduce those four layers on a different schema—articles, users, restaurants, posts, jobs, documents—you understand the architecture rather than just the SearchLab implementation.
