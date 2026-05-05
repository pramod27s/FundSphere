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
- **Hybrid Search with Reciprocal Rank Fusion** — combines PostgreSQL keyword search and Pinecone vector search, reranked by Freshness, Eligibility, and Expired Penalty modifiers.
- **Two-Pass Delta Scraping** — SHA-256 hash check on agency pages first (zero-cost monitor); only when content changes does Firecrawl extract structured grant data into a strict schema.
- **Rich Researcher Profiles** — career stage, institution type, country, funding preferences, and notification controls drive personalization.

## How AI Match Works

1. Frontend sends a query → `CoreBackend`
2. `CoreBackend` hydrates the researcher's full profile from Postgres → forwards to `ai-service`
3. `ai-service` embeds the profile + query, searches Pinecone with hard metadata filters (country, applicantType)
4. Vector hits are merged with keyword hits, then scored:
   - Semantic similarity 45%
   - Keyword match 25%
   - Eligibility 15%
   - Deadline freshness 10%
5. Ranked results return through `CoreBackend` → rendered as match cards with percentage + AI reasoning

## Scraping Pipeline

1. `smart_scheduler.py` runs on a cron schedule
2. Hashes the `<main>` text of each target agency page
3. If the hash differs from the stored value, dispatches Firecrawl with a strict system prompt to extract `GrantSchema` fields (e.g. `fundingAmountMax`, `eligibleCountries`)
4. Clean JSON is POSTed to `CoreBackend` → persisted to Postgres and embedded into Pinecone

## Project Structure

```
FundSphere/
├── frontend/         # React + Vite + TS dashboard
├── CoreBackend/      # Spring Boot API gateway and persistence
├── ai-service/       # FastAPI: RAG, scoring, scraping
│   ├── rag/
│   ├── proposal/
│   ├── eval/
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
- Pinecone API key, Firecrawl API key

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

- [`ABOUT_FUNDSPHERE.md`](ABOUT_FUNDSPHERE.md) — extended product overview
- [`docs/`](docs/) — architecture and design notes
- [`LLM_PROPOSAL_ASSISTANT_ARCHITECTURE_1.md`](LLM_PROPOSAL_ASSISTANT_ARCHITECTURE_1.md) — proposal assistant design

## License

TBD
