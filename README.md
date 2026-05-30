# FundSphere

An AI-driven grant discovery and matching platform for researchers, startups, and academic institutions. FundSphere combines semantic search (RAG), hybrid ranking, and intelligent web scraping to surface the funding opportunities a user is most likely to qualify for — with explainable reasoning for every match.

## Architecture

FundSphere is a three-tier system with a clean separation between user-facing UI, business logic, and the AI/retrieval layer.

```
┌─────────────┐      ┌──────────────────┐      ┌────────────────┐
│  Frontend   │ ───▶ │   CoreBackend    │ ───▶ │   AI-Service   │
│ React + TS  │      │ Java Spring Boot │      │ Python FastAPI │
└─────────────┘      └────────┬─────────┘      └────────┬───────┘
                              │                         │
                         ┌────▼─────┐              ┌────▼─────┐
                         │ Postgres │              │ Pinecone │
                         └──────────┘              └──────────┘
```

| Layer | Stack | Role |
|---|---|---|
| `frontend/` | React 18, Vite, TypeScript, Tailwind | User dashboard, AI Match UI, profile management |
| `CoreBackend/` | Java 17, Spring Boot, PostgreSQL, JWT | Auth, researcher profiles, AI bridge, persistence |
| `ai-service/` | Python, FastAPI, Pinecone, Firecrawl | Embeddings, hybrid retrieval, scoring, scraping |

## Key Features

- **AI-Powered Grant Matching (RAG)** — semantic understanding of a researcher's bio, interests, and constraints, with explainable rationale per match.
- **Hybrid Search with Reciprocal Rank Fusion** — combines PostgreSQL keyword search and Pinecone vector search (with HyDE for improved recall), fused via RRF, **reranked by a cross-encoder** (bge-reranker-v2-m3), then scored across 5 signals: semantic similarity, eligibility, keyword match, funding fit, and deadline freshness.
- **Structured Eligibility & Preference Matching** — hard guards for PhD-required / minimum-experience / citizenship, plus soft bonuses for preferred grant type and target career stage. **Expired grants are filtered out**, never recommended.
- **AI Proposal Assistant** — upload a draft proposal PDF and grant guidelines PDF; get structured per-section compliance feedback (Quick ~10 s / Deep ~30–90 s), a revision diff card, and Markdown/PDF export.
- **Two-Pass Delta Scraping** — SHA-256 content checksum on agency pages first (zero-cost monitor); only when content changes does Firecrawl extract structured grant data into a strict schema. Per-domain crawler selectors, headless-render fallback for JS pages, and a politeness throttle.
- **Rich Researcher Profiles** — free-text research summary (the strongest matching signal), interests, citizenship, institution type, career stage, funding preferences, and **one-click ORCID import** to prefill the profile.
- **Evaluation & Auto-Tuning** — a token-safe LLM eval harness (Recall/MRR/NDCG) plus a weight tuner that sweeps thousands of configs and recommends the optimal scoring weights. One-click via `ai-service/eval.bat`.
- **Saved Grants** — bookmark any grant; persisted in PostgreSQL with optimistic UI and rollback.

## How AI Match Works

1. Frontend sends a query → `CoreBackend`
2. `CoreBackend` hydrates the researcher's full profile from Postgres → forwards to `ai-service`
3. `ai-service` embeds the profile + query, searches Pinecone with soft metadata filters (country, applicantType)
4. Vector hits are merged with keyword hits (RRF), then a cross-encoder reranks the pool
5. Each candidate is scored across 5 signals (env-overridable, optionally per applicant-type preset):
   - Semantic similarity 35%
   - Eligibility 25% — incl. hard guards for PhD / experience / citizenship
   - Keyword match 15%
   - Funding fit 15%
   - Deadline freshness 10%
   - plus small bonuses for grant-type and career-stage preference match
6. Expired grants are removed, the score is clamped to 0–100%, and ranked results return through `CoreBackend` → match cards with percentage + AI reasoning

## Scraping Pipeline

1. `smart_scheduler.py` runs on a cron schedule
2. Hashes the content text of each target agency page (headless-render fallback for JS-only pages)
3. If the hash differs from the stored value, dispatches Firecrawl with a strict system prompt to extract `GrantSchema` fields — including eligibility constraints (`requiresPhd`, `minExperienceYears`, `citizenshipRequired`), `grantType`, `targetCareerStages`, and key dates (`openingDate`, `loiDeadline`, `decisionDate`, `projectStartDate`)
4. Clean JSON is POSTed to `CoreBackend` → persisted to Postgres and embedded into Pinecone

## Evaluation & Tuning

Matching quality is measurable and the scoring weights are tunable — without burning LLM tokens on every run. One-click via `ai-service/eval.bat`:

- **Measure** (`auto_eval.py`) — runs real/sample profiles through the recommender, an LLM judges each result 0–3, and reports **Recall@K / MRR / NDCG@K**. A baseline-vs-improved compare mode A/Bs the accuracy flags. The test set and judgments are cached, so re-runs cost ~0 tokens and resume after interruption.
- **Auto-tune** (`tune.py`) — snapshots each candidate's sub-scores once, then sweeps thousands of weight vectors as pure arithmetic and recommends the highest-NDCG `WEIGHT_*` set to paste into `.env`. Zero LLM tokens.

A preflight refuses to run unless CoreBackend and the ai-service are reachable. (LLM judgments are pseudo-labels — trust the deltas, confirm before shipping.)

## Project Structure

```
FundSphere/
├── frontend/         # React + Vite + TS dashboard
├── CoreBackend/      # Spring Boot API gateway and persistence
├── ai-service/       # FastAPI: RAG, scoring, scraping
│   ├── rag/
│   ├── proposal/
│   ├── eval/         # auto_eval.py (measure) + tune.py (auto-tune weights)
│   ├── eval.bat      # one-click eval/tuning launcher
│   ├── smart_scheduler.py
│   ├── firecrawl_scraper.py
│   └── index_all_grants.py
└── docs/             # Architecture notes and design docs
```

## Quickstart

### Prerequisites
- Node.js 18+
- Java 17+ and Maven
- Python 3.11+
- PostgreSQL 14+
- Pinecone API key, Firecrawl API key, Google Gemini API key

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### CoreBackend
```bash
cd CoreBackend
./mvnw spring-boot:run
```

### AI-Service
```bash
cd ai-service
pip install -r requirements.txt
uvicorn main:app --reload
```

Each service reads its config from a local `.env` (or `application.properties` for Spring Boot). See the per-component README/HELP files for required environment variables.

## Documentation

- [`docs/ABOUT_FUNDSPHERE.md`](docs/ABOUT_FUNDSPHERE.md) — extended product overview
- [`docs/PROJECT_STATUS_AND_ARCHITECTURE.md`](docs/PROJECT_STATUS_AND_ARCHITECTURE.md) — full component inventory and data flows
- [`docs/LLM_PROPOSAL_ASSISTANT_ARCHITECTURE_1.md`](docs/LLM_PROPOSAL_ASSISTANT_ARCHITECTURE_1.md) — proposal assistant design

## License

TBD
