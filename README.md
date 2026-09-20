# FundSphere

An AI-driven grant discovery and proposal assistance platform for researchers, startups, and academic institutions. FundSphere combines hybrid retrieval (semantic vector search + keyword search), Reciprocal Rank Fusion (RRF), cross-encoder reranking, and intelligent web scraping to surface funding opportunities tailored to a researcher's profile — with explainable match reasoning and proposal compliance auditing.

---

## Architecture Overview

FundSphere is structured as a three-tier system with clean separation between the user interface, business logic / persistence, and the AI retrieval & analytics engine.

```
┌─────────────────────────┐          ┌───────────────────────────┐          ┌──────────────────────────┐
│   Frontend (Port 5173)  │  HTTP    │  CoreBackend (Port 8080)  │  HTTP    │  AI-Service (Port 8000)  │
│   React 19 + TypeScript │ ───────▶ │   Java 21 + Spring Boot   │ ───────▶ │     Python + FastAPI     │
│   Tailwind CSS v4 + Vite│          │   PostgreSQL + JWT Auth   │ ◀─────── │  Pinecone + Groq/Gemini  │
└─────────────────────────┘          └─────────────┬─────────────┘          └────────────┬─────────────┘
                                                   │                                     │
                                            ┌──────▼──────┐                       ┌──────▼──────┐
                                            │ PostgreSQL  │                       │  Pinecone   │
                                            │  Database   │                       │  Vector DB  │
                                            └─────────────┘                       └─────────────┘
```

| Layer | Stack | Key Responsibilities |
|---|---|---|
| **`frontend/`** | React 19, Vite 7 (SWC), TypeScript, Tailwind CSS v4, React Router v7, Framer Motion, Lucide Icons | Responsive UI, landing page, onboarding wizard, AI Match feed, saved grants, proposal assistant workspace |
| **`CoreBackend/`** | Java 21, Spring Boot 4.0.3, Spring Data JPA / Hibernate, PostgreSQL, JWT Authentication | Authentication & token refresh, researcher profiles, grant CRUD & keyword search, AI service bridge, background reindexing sweeper |
| **`ai-service/`** | Python 3.11+, FastAPI, Pinecone, Google Gemini, Groq, Firecrawl, Selenium | Vector embeddings, HyDE, hybrid search fusion (RRF), cross-encoder reranking, 5-signal scoring, proposal compliance auditing, delta scraping |

---

## Frontend Application Routes

The frontend provides a complete, modern single-page application experience with dedicated routes:

| Route | View | Description |
|---|---|---|
| `/` & `/landing` | **Landing Page** | Public showcase featuring the dynamic hero, interactive value proposition, platform statistics, and feature highlights |
| `/auth` | **Authentication** | Unified Login and Register forms with real-time password strength validation and automatic JWT session recovery |
| `/onboarding` | **Researcher Wizard** | Multi-step onboarding flow with **one-click ORCID integration** to auto-fill research bio, career stage, and keywords |
| `/discovery` | **Grant Discovery** | Dual-mode feed: **Browse Mode** with multi-faceted filtering & pagination, and **AI Match Mode** with RAG scoring breakdown |
| `/saved` | **Saved Grants** | Bookmarked funding opportunities with PostgreSQL persistence, optimistic UI updates, and rollback handling |
| `/proposal` | **Proposal Assistant** | Proposal PDF + guidelines PDF compliance analyzer (Quick & Deep analysis) with section rubrics and diff cards |
| `/profile` | **Profile Management** | Edit research interests, institution type, citizenship, degree requirements, and funding preferences |

---

## Key Features

- **AI-Powered Grant Matching (RAG)** — Deep semantic understanding of researcher bios, research areas, and constraints. Every recommended grant includes an explainable score breakdown showing match rationale.
- **Hybrid Retrieval with Reciprocal Rank Fusion (RRF)** — Blends keyword search results from PostgreSQL with high-dimensional vector search hits from Pinecone, balancing lexical precision with semantic recall.
- **Cross-Encoder Reranking** — Re-scores the top RRF candidate pool using Pinecone Inference with `bge-reranker-v2-m3`, drastically improving top-10 precision over single-vector retrieval.
- **Hypothetical Document Embeddings (HyDE)** — Generates hypothetical grant solicitations tailored to user queries to bridge the vocabulary gap between researcher phrasings and formal agency RFPs.
- **Structured Eligibility & Scoring Engine** — Transparent 5-signal candidate evaluation:
  - Semantic similarity (35%)
  - Eligibility constraints (25% — hard guards for PhD, experience, citizenship)
  - Keyword match (15%)
  - Funding fit (15%)
  - Deadline freshness (10%)
  - Plus soft preference bonuses for preferred grant types and career stages. **Expired grants are automatically filtered out**.
- **AI Proposal Assistant** — Upload a draft proposal PDF and grant guidelines PDF. Google Gemini evaluates structure, compliance, methodology, and rubrics, providing actionable per-section feedback (Quick ~10s / Deep ~30–90s), a revision diff card, and Markdown/PDF export.
- **Intelligent Two-Pass Delta Scraper** — SHA-256 content checksumming monitors agency seed pages with zero LLM overhead. When changes are detected, Firecrawl / headless browser extracts structured fields (`GrantSchema`). Unchanged pages trigger the lightweight `/api/grants/verify` endpoint, avoiding redundant vector reindexing.
- **Resilient Background Indexing** — CoreBackend's `ReindexSweeper` operates on a scheduled loop with exponential backoff and dead-letter protection to ensure every database grant is reliably synchronized to Pinecone.
- **One-Click ORCID Import** — Automatically queries the public ORCID API by researcher iD to pull author biographies and recent publications directly into the onboarding wizard.
- **Evaluation & Weight Auto-Tuning** — Built-in offline evaluation suite (`ai-service/eval/`) measuring Recall@K, MRR, and NDCG@K, alongside a token-free combinatorial weight optimizer (`tune.py`), runnable via `eval.bat`.

---

## How AI Match Works

```
 ┌──────────────────────┐
 │  Frontend Discovery  │
 └──────────┬───────────┘
            │ 1. Search Query + Filters
            ▼
 ┌──────────────────────┐
 │     CoreBackend      │
 └──────────┬───────────┘
            │ 2. Hydrates full researcher profile from PostgreSQL
            ▼
 ┌──────────────────────┐
 │      ai-service      │
 └──────────┬───────────┘
            │ 3. Generates query embeddings (+ HyDE if enabled)
            │ 4. Pinecone Vector Search + PostgreSQL Keyword Search
            │ 5. Merges candidates using Reciprocal Rank Fusion (RRF)
            │ 6. Cross-Encoder Reranking (bge-reranker-v2-m3)
            │ 7. Evaluates 5 scoring signals + eligibility guards
            │ 8. Removes expired grants; computes AI match explanation
            ▼
 ┌──────────────────────┐
 │  Frontend Match Card │  Displays match percentage, eligibility badge,
 └──────────────────────┘  breakdown metrics, and detailed reasoning
```

---

## Scraping & Indexing Pipeline

1. **Scheduled Delta Monitor**: `smart_scheduler.py` runs on a cron interval to inspect funding agency pages.
2. **Checksum Verification**: Hashes page content. If unchanged, calls `POST /api/grants/verify` in `CoreBackend` to refresh `lastVerifiedAt` without triggering vector work.
3. **Structured Extraction**: If content has changed, Firecrawl / headless browser parses grant details into `GrantSchema` (deadlines, funding amounts, eligibility, career stages).
4. **Persistence & Sync**: Clean JSON is POSTed to `CoreBackend` (`POST /api/grants`), saved to PostgreSQL, and forwarded to `ai-service` for embedding into Pinecone.
5. **Reindex Sweeper**: In case of temporary network glitches, `ReindexSweeper` in `CoreBackend` automatically catches unsynced grants and reindexes them.

---

## Evaluation & Tuning

The AI retrieval system includes a measurable evaluation harness located in `ai-service/eval/` (executable with `ai-service/eval.bat`):

- **Measure (`auto_eval.py`)**: Runs real/sample researcher profiles against the recommender, benchmarks retrieved candidates, and computes **Recall@K**, **MRR**, and **NDCG@K**. Test sets and LLM judgments are cached locally to prevent token waste.
- **Auto-Tune (`tune.py`)**: Uses pre-computed subscores to simulate thousands of weight combinations as pure vector arithmetic, outputting the optimal `WEIGHT_*` values to include in `.env` without incurring LLM costs.

---

## Project Structure

```
FundSphere/
├── frontend/               # React 19 + TypeScript + Tailwind CSS v4 SPA
│   ├── src/
│   │   ├── components/     # Landing, Auth, Onboarding, Discovery, Saved, Proposal, Profile
│   │   ├── context/        # Global ResearcherContext
│   │   ├── services/       # API clients, auth token management
│   │   └── utils/          # Glossary, password strength, helpers
│   ├── package.json
│   └── vite.config.ts
├── CoreBackend/            # Java 21 + Spring Boot API Gateway & Persistence
│   ├── src/main/java/org/pramod/corebackend/
│   │   ├── config/         # Security, CORS, WebClient configs
│   │   ├── controller/     # REST Controllers (Auth, Grants, AI Bridge, Proposal, Researcher)
│   │   ├── entity/         # JPA Entities (AppUser, Grant, Researcher, SavedGrant, RefreshToken)
│   │   ├── repository/     # Spring Data JPA Repositories
│   │   ├── security/       # JWT Filters, UserPrincipal, Auth Entry Point
│   │   └── service/        # Business Logic, AiServiceClient, ReindexSweeper, OrcidEnrichment
│   └── pom.xml
├── ai-service/             # Python FastAPI: Hybrid Search, RAG, Proposal Analysis, Scrapers
│   ├── rag/                # Recommender, Pinecone client, HyDE, query expander, scoring
│   ├── proposal/           # Gemini client, PDF extractor, rubric analyzer, diff builder
│   ├── eval/               # Evaluation metrics (auto_eval.py) & weight tuner (tune.py)
│   ├── smart_scheduler.py  # Delta scraping scheduler
│   ├── firecrawl_scraper.py# Structured web scraping with Firecrawl
│   ├── main.py             # FastAPI entry point & security middleware
│   └── requirements.txt
└── docs/                   # Architecture notes, accuracy reports, and specifications
```

---

## Quickstart

### Prerequisites

- **Node.js**: v18.0+ (Node.js 20+ recommended)
- **Java**: JDK 21+ and Maven
- **Python**: 3.11+
- **PostgreSQL**: 14+
- **API Keys**:
  - Pinecone API Key & Index Host
  - Google Gemini API Key (for Proposal Assistant)
  - Groq API Key (for HyDE, Query Expansion, LLM Judge)
  - Firecrawl API Key (for web scraping)

---

### Environment Setup

#### 1. CoreBackend (`CoreBackend/.env` or root `.env`)
```env
DB_USERNAME=postgres
DB_PASSWORD=your_postgres_password
JWT_SECRET=your_base64_or_long_random_jwt_secret_key_min_256_bits
INTEGRATION_API_KEY=your_shared_internal_api_key
```

#### 2. AI-Service (`ai-service/.env`)
```env
SPRING_BOOT_BASE_URL=http://localhost:8080
SPRING_BOOT_API_KEY=your_shared_internal_api_key
REQUIRE_INTERNAL_API_KEY=true

PINECONE_API_KEY=your_pinecone_key
PINECONE_INDEX_HOST=https://your-index-host.pinecone.io
PINECONE_NAMESPACE=grants
PINECONE_RERANK_MODEL=bge-reranker-v2-m3

# Groq (HyDE, Query Expansion, LLM Judge)
GROQ_API_KEY_QUERY_EXPANSION=your_groq_key
GROQ_API_KEY_LLM_JUDGE=your_groq_key
GROQ_API_KEY_HYDE=your_groq_key
ENABLE_HYDE=true

# Google Gemini (Proposal Assistant)
GEMINI_API_KEY=your_gemini_api_key
PROPOSAL_GEMINI_MODEL=gemini-2.5-flash

# Firecrawl (Scraper)
FIRECRAWL_API_KEY=your_firecrawl_api_key
```

---

### Running the Application

#### 1. Start CoreBackend (Spring Boot)
Ensure PostgreSQL is running and a database named `FundSphere` exists.
```bash
cd CoreBackend
./mvnw spring-boot:run
```
*Backend runs on `http://localhost:8080`.*

#### 2. Start AI-Service (FastAPI)
```bash
cd ai-service
python -m venv .venv
# On Windows: .venv\Scripts\activate | On Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
*AI service runs on `http://localhost:8000`.*

#### 3. Start Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev
```
*Frontend runs on `http://localhost:5173`.*

---

## Documentation Links

- [`docs/ABOUT_FUNDSPHERE.md`](docs/ABOUT_FUNDSPHERE.md) — Comprehensive product overview and vision.
- [`docs/PROJECT_STATUS_AND_ARCHITECTURE.md`](docs/PROJECT_STATUS_AND_ARCHITECTURE.md) — Detailed service inventory and schema contracts.
- [`docs/architecture.md`](docs/architecture.md) — In-depth architectural blueprint and data flow models.
- [`docs/accuracy.md`](docs/accuracy.md) & [`docs/ACCURACY_CHANGES.md`](docs/ACCURACY_CHANGES.md) — Accuracy improvements (profile-query split, HyDE, structured rerank prompt).
- [`docs/LLM_PROPOSAL_ASSISTANT_ARCHITECTURE_1.md`](docs/LLM_PROPOSAL_ASSISTANT_ARCHITECTURE_1.md) — Proposal assistant engine architecture.
- [`docs/PROPOSAL_ASSISTANT_IMPLEMENTATION_STRATEGY.md`](docs/PROPOSAL_ASSISTANT_IMPLEMENTATION_STRATEGY.md) — Proposal assistant implementation strategy and rubrics.
- [`deploy.md`](deploy.md) — Cloud and container deployment guidelines.

---

## License

TBD
