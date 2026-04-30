# FundSphere — RAG & AI Matching Architecture Recommendation

## Current State: What's Broken

| Problem | Impact |
|---------|--------|
| **Reranker configured but never called** | bge-reranker-v2-m3 is set in config but the code discards it — you're paying for Pinecone inference without using it |
| **No true hybrid search** | You claim RRF but only run Pinecone dense+sparse; PostgreSQL keyword search is dead code |
| **Keyword score hardcoded to 0.0** | ABOUT_FUNDSPHERE.md promises 25% keyword weight, config.py gives it 0% |
| **Metadata filters too strict** | Hard `$and` filters silently drop grants with missing fields — kills recall |
| **LLM judge as hard filter** | Groq can eliminate ALL candidates, returning empty results |
| **Eligibility ignores aliases** | "USA" ≠ "United States", "PhD Student" ≠ "Student" — silent mismatches |
| **Title prefix pollutes embeddings** | `[Title: ... \| Agency: ...]` baked into chunk text wastes ~20 tokens per chunk |

---

## Recommended RAG Architecture

### 1. Ingestion Pipeline (What You Have Is Good — Refine It)

Your Firecrawl + hash-based change detection is solid. Fix two things:

#### A. Field-Aware Chunking

Don't treat grants as one blob. Create separate chunk types:

```
chunk_type: "description"    → grant overview, objectives
chunk_type: "eligibility"    → who can apply, criteria, constraints
chunk_type: "funding_scope"  → amounts, themes, research areas
chunk_type: "metadata"       → agency, deadline, country (never embed this — store as Pinecone metadata only)
```

Each chunk gets `chunk_type` as metadata. This lets you **boost retrieval by intent** — if a user asks "am I eligible?", you weight `eligibility` chunks higher.

#### B. Clean Chunk Text

Remove the `[Title: ... | Agency: ...]` prefix from `chunk_text`. Store title/agency as **Pinecone metadata fields** instead. This gives you ~20 more tokens per chunk for actual content and stops the embedding model from over-indexing on grant titles.

**Chunk parameters**: Keep 400 tokens / 80 overlap, but use **recursive character splitting** with sentence boundaries. Your current sentence-aware approach is correct.

### 2. Embedding & Indexing

**Keep**: `llama-text-embed-v2` (1024-dim dense) + `pinecone-sparse-english-v0` (SPLADE sparse). This is a good combo.

**Add**: A **retry queue** for indexing. Your current fire-and-forget `CompletableFuture.runAsync` silently drops grants if Pinecone is down. Use a simple database-backed queue:

```sql
CREATE TABLE indexing_queue (
    grant_id   BIGINT PRIMARY KEY,
    status     VARCHAR(10) DEFAULT 'PENDING',  -- PENDING / INDEXED / FAILED
    retry_count INT DEFAULT 0,
    last_attempted_at TIMESTAMP
);
```

Spring polls this every 60s and retries failures up to 3 times.

### 3. Retrieval — The Core Fix

Here's the architecture you should build, in order of execution:

```
User Query
    │
    ▼
┌─────────────────────────┐
│  STAGE 1: Query Build    │  profile_builder.py (keep as-is)
│  Bio + keywords + field  │
│  + country + funding     │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│  STAGE 2: Three Channels │  Run in PARALLEL
│                          │
│  A. Pinecone Hybrid      │  dense·α + sparse·(1-α), top-50
│     α = 0.7 (default)   │  Soft metadata filters (see below)
│                          │
│  B. PostgreSQL FTS       │  ts_rank on tsvector column
│     Keywords + field     │  top-50
│                          │
│  C. Structured Filter    │  SQL query on country, field,
│     Exact match on       │  funding range, deadline
│     eligibility fields   │  top-50
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│  STAGE 3: RRF Fusion     │  Reciprocal Rank Fusion
│                          │  score = Σ 1/(k + rank_i)
│  k = 60 (standard)      │  across all 3 channels
│  Deduplicate by grant_id │
│  Output: top-30          │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│  STAGE 4: Reranker       │  bge-reranker-v2-m3
│                          │  (you already pay for it!)
│  Input: query + top-30   │  Rerank grant descriptions
│  chunk texts             │  against original query
│  Output: top-15          │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│  STAGE 5: Business Rules │  Deterministic scoring
│                          │
│  Eligibility:  0.25      │  With alias normalization
│  Freshness:    0.10      │  Deadline + scrape recency
│  Funding fit:  0.10      │  Range overlap %
│  Reranker:     0.55      │  From Stage 4
│                          │
│  Penalty: expired = -0.3 │
│  Output: top-10          │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│  STAGE 6: LLM Explain    │  Groq (NOT a filter!)
│  (optional)              │
│  Generate 2-3 sentence   │  "This grant matches because
│  explanation per grant   │   your ML research aligns..."
│  NEVER remove candidates │
└─────────────────────────┘
```

### Key Design Decisions Explained

#### Why 3 channels instead of 1?

Pinecone hybrid search alone misses grants where the text is semantically related but uses different terminology (semantic gap), AND misses grants where the user's exact keywords appear but the embedding space doesn't cluster them near the query. Three channels cover:

- **Semantic similarity** (Pinecone dense) — "machine learning" matches "neural networks"
- **Lexical matching** (PostgreSQL FTS + Pinecone sparse) — exact keyword hits
- **Structured eligibility** (SQL filters) — hard constraints like country, funding range, deadline

#### Why RRF instead of weighted sum?

Your current max-of-scores approach is fragile — it over-indexes on whichever channel happens to return the highest raw score. RRF is **rank-based**, not score-based, so it's robust to different score distributions across channels. The formula `1/(k + rank)` with k=60 is well-proven.

#### Why demote the LLM judge to "explain only"?

Your current setup lets Groq **eliminate all candidates**, leaving users with zero results. An LLM should never be a hard gate on search results. Use it to generate human-readable explanations ("This grant matches because your focus on renewable energy aligns with their sustainability objectives"), not to filter.

#### Why soft metadata filters?

Your current `$and` filter drops any grant missing a field. Instead:

```python
# CURRENT (too strict — kills recall)
filter = {"$and": [{"country": "India"}, {"applicant_type": "Student"}, {"field": "CS"}]}

# PROPOSED (soft — boost matches, don't exclude)
filter = {"$or": [
    {"country": {"$in": ["India", "All", ""]}},  # include blanks
    {"country": {"$exists": False}}                # include missing
]}
# Then score eligibility match in Stage 5, not Stage 2
```

Move hard filtering to Stage 5 (business rules) where you can apply it as a **score adjustment** rather than a binary exclude.

### 4. Eligibility Normalization

Build a simple alias map (not ML — just a dictionary):

```python
COUNTRY_ALIASES = {
    "USA": "United States", "US": "United States",
    "UK": "United Kingdom",
    "India": "India", "IN": "India",
    # ...
}

APPLICANT_ALIASES = {
    "PhD Student": ["Student", "Doctoral", "Graduate"],
    "Faculty": ["Professor", "Academic", "Researcher"],
    "Startup": ["Entrepreneur", "Small Business", "SME"],
}
```

Use these in Stage 5 eligibility scoring. A fuzzy match scores 0.7, an exact match scores 1.0, a miss scores 0.0.

### 5. PostgreSQL Changes Needed

Add a `tsvector` column and GIN index to the grants table:

```sql
ALTER TABLE grants ADD COLUMN search_vector tsvector;

CREATE INDEX idx_grants_search ON grants USING GIN(search_vector);

-- Trigger to auto-update on insert/update
UPDATE grants SET search_vector =
  setweight(to_tsvector('english', coalesce(grant_title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(research_themes, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(eligibility_criteria, '')), 'C');
```

This gives you **weighted full-text search** as Channel B — titles weighted highest, descriptions next, eligibility lowest.

---

## AI Matching System — Scoring Weights

Replace your current `70/20/10` with a **5-signal model**:

| Signal | Weight | Source | What It Captures |
|--------|--------|--------|------------------|
| **Semantic relevance** | 0.35 | Reranker score (Stage 4) | "Does this grant's research area match the user's work?" |
| **Eligibility fit** | 0.25 | Alias-normalized match (Stage 5) | Country, applicant type, institution type, field |
| **Keyword overlap** | 0.15 | PostgreSQL FTS rank | Exact term matches the user explicitly cares about |
| **Funding fit** | 0.15 | Range overlap calculation | Does the grant's funding range intersect the user's needs? |
| **Freshness** | 0.10 | Deadline proximity + scrape recency | Prefer upcoming deadlines, recently verified data |

### Funding Fit Formula

```python
overlap = min(grant_max, user_max) - max(grant_min, user_min)
range = user_max - user_min
funding_score = max(0, overlap / range)
```

### Freshness Formula (Fix Your Current One)

```python
days_to_deadline = (deadline - today).days
deadline_score = 1.0 if 7 < days < 90 else 0.5 if 90 <= days < 180 else 0.2 if days >= 180 else 0.0

scrape_age = (today - last_scraped_at).days
scrape_score = 1.0 if scrape_age < 7 else 0.7 if scrape_age <= 30 else 0.3

freshness = 0.6 * deadline_score + 0.4 * scrape_score
```

---

## Feedback Loop (What You're Missing Entirely)

You have **zero observability** into whether recommendations are good. Add:

```sql
CREATE TABLE recommendation_events (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT REFERENCES app_users(id),
    grant_id    BIGINT REFERENCES grants(id),
    event_type  VARCHAR(20),   -- 'SHOWN', 'CLICKED', 'SAVED', 'APPLIED', 'DISMISSED'
    position    INT,            -- rank position shown to user
    scores      JSONB,          -- {semantic: 0.8, eligibility: 0.9, ...}
    created_at  TIMESTAMP DEFAULT NOW()
);
```

Track what users click, save, and ignore. After 1000+ events, you can:

1. **Tune weights** — if users consistently click grants with high eligibility but low semantic score, increase eligibility weight
2. **Detect bad matches** — grants shown at position 1 but never clicked are false positives
3. **A/B test** — compare weight configurations

---

## Implementation Priority

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| **P0** | Actually call the reranker (it's already configured) | 1 day | High — instant quality lift |
| **P0** | Implement real RRF fusion across channels | 2-3 days | High — fixes broken hybrid search |
| **P0** | Soft metadata filters (don't exclude, score instead) | 1 day | High — fixes silent recall loss |
| **P1** | Add PostgreSQL FTS as a retrieval channel | 2 days | Medium — catches exact keyword matches |
| **P1** | Eligibility alias normalization | 1 day | Medium — fixes "USA" ≠ "United States" |
| **P1** | Demote LLM judge to explanation-only | 0.5 day | Medium — stops empty results |
| **P1** | Field-aware chunking | 2 days | Medium — better embedding quality |
| **P2** | Indexing retry queue | 1 day | Medium — stops silent data loss |
| **P2** | Recommendation events table | 1 day | Long-term — enables weight tuning |
| **P2** | Embedding/query cache | 1 day | Cost savings + latency |

---

## Summary

The P0 items alone — **reranker activation, real RRF, and soft filters** — would likely improve matching quality by **30-40%** with about a week of work. The current implementation is ~60% complete: ingestion is solid, basic vector retrieval works, but the hybrid search, scoring, and quality feedback layers are either broken or missing.
