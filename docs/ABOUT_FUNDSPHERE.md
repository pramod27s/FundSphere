# FundSphere

**FundSphere** is an intelligent, AI-driven grant discovery and proposal assistance platform. It bridges the gap between researchers, startups, and academic institutions and the complex landscape of global funding opportunities. By leveraging React + Spring Boot + FastAPI, Large Language Models (Gemini), and Vector Search (RAG via Pinecone), FundSphere automates the labor-intensive process of finding, qualifying for, and writing grants.

---

## Key Features

### 1. AI-Powered Grant Matching (RAG)
- Replaces keyword-only searches with deep semantic understanding of a user's research bio, interests, and constraints.
- Generates an **Explainable AI Rationale** for every match (e.g., *"Strong semantic overlap in climate tech and explicitly matches your PhD applicant profile"*).
- **Hybrid Search Engine** using Reciprocal Rank Fusion (RRF) — combines PostgreSQL keyword search with Pinecone vector search.
- Final score calculated from: Semantic similarity (45%), Keyword match (25%), Eligibility (15%), Deadline Freshness (10%).

### 2. AI Proposal Assistant
- Accepts a **draft proposal PDF** and a **grant guidelines PDF**, then returns structured per-section compliance feedback.
- Two analysis modes:
  - **Quick** — 1 LLM call, ~10 seconds, overall score + section highlights.
  - **Deep** — LLM-based section splitting → parallel per-section evaluation against full guidelines → missing-section detection → LLM-written summary (~30–90 seconds).
- Results include: animated score ring, missing-sections warning, sortable section accordion (missing → weak → strong), and top recommendations.
- **Revision flow** — re-upload an improved draft and see a diff card ("Score 68 → 84 (+16)") showing which sections improved or regressed.
- Export options: Markdown download, or print-to-PDF via browser's native print dialog.

### 3. Saved Grants (Persistent)
- Researchers can bookmark any grant from both the discovery feed and AI match results.
- Persisted in PostgreSQL (`saved_grants` table) with optimistic UI + rollback on failure.
- One-time migration from legacy localStorage on first login.

### 4. Smart Ingestion Pipeline ("Two-Pass Delta" Scraping)
- **Pass 1 (Free Monitor):** `smart_scheduler.py` hashes the raw `<main>` text of target agency pages to detect content deltas.
- **Pass 2 (AI Extractor):** On hash change, Firecrawl is dispatched with a strict system prompt to extract unstructured web text into a typed `GrantSchema` JSON (fields: `fundingAmountMax`, `eligibleCountries`, deadlines, etc.).
- Clean JSON is POSTed to CoreBackend → persisted to PostgreSQL + embedded into Pinecone.

### 5. Researcher Profiles & Onboarding
- Multi-step onboarding wizard capturing: user type, career stage, institution, country, research areas, funding preferences, and notification settings.
- Profile completion progress bar + hero section with stats.
- Fine-grained notification preferences for deadlines and weekly recommendations.

### 6. JWT Authentication
- Access token + refresh token flow, fully implemented end-to-end.
- Auto-redirect to login on token expiry (`auth:unauthorized` window event).
- All sensitive routes guarded in both Spring Boot (`SecurityConfig`) and the React state machine.

---

## Architecture & Tech Stack

FundSphere uses a three-tier architecture across three independent services:

### Frontend
| | |
|---|---|
| Framework | React 18 + Vite + TypeScript |
| Styling | Tailwind CSS + Lucide Icons + Framer Motion |
| Navigation | State machine (`currentPage` union in `App.tsx`) — no React Router |
| Pages | Auth, Onboarding, Discovery, Profile, Saved Grants, Proposal Assistant |

### CoreBackend (Business Logic & Gateway)
| | |
|---|---|
| Framework | Java 17 / Spring Boot |
| Database | PostgreSQL (JPA / Hibernate) |
| Auth | JWT + Refresh Tokens (`JwtService`, `JwtAuthenticationFilter`) |
| Key Controllers | `AuthController`, `ResearcherController`, `GrantController`, `AiBridgeController`, `SavedGrantController`, `ProposalController` |
| AI Bridge | `AiServiceClient` proxies requests to FastAPI with internal `X-API-KEY` authentication |

### AI-Service (Intelligence Layer)
| | |
|---|---|
| Framework | Python / FastAPI |
| LLM | Google Gemini 2.5 Pro (auto-fallback to Gemini 2.5 Flash on quota errors) |
| Vector DB | Pinecone |
| Scraping | Firecrawl API |
| Routers | `rag/routes.py` (grant matching), `proposal/routes.py` (proposal analysis) |
| Key Modules | `recommender.py` (RRF scoring), `analyzer.py` (proposal deep/simple modes), `smart_scheduler.py` (delta scraper), `gemini_client.py` (async LLM wrapper) |

---

## Data Flow

### AI Match
```
React (GrantDiscovery)
  → POST /api/grants/search (JWT)
Spring Boot (AiBridgeController)
  → hydrates researcher profile from PostgreSQL
  → POST /rag/recommend (X-API-KEY)
FastAPI (rag/routes)
  → Pinecone vector search + PostgreSQL keyword candidates
  → RRF fusion + dynamic scoring (recommender.py)
  ← ranked GrantResponse list with AI rationale
```

### Proposal Assistant
```
React (WritingProposal)
  → POST /api/proposal/analyze multipart (JWT)
Spring Boot (ProposalController → AiServiceClient)
  → POST /proposal/analyze multipart (X-API-KEY)
FastAPI (proposal/routes)
  → pdf_extractor → section_splitter → analyzer → gemini_client → Gemini
  ← ProposalAnalysisResponse JSON (score, per-section feedback, missing sections)
```

---

## Current Status (as of May 2026)

| Area | Status |
|---|---|
| Auth (register / login / refresh) | Done |
| Researcher onboarding wizard | Done |
| Grant discovery (browse + AI match) | Done |
| Saved grants (Postgres-backed) | Done |
| AI Proposal Assistant (Quick + Deep) | Done |
| Proposal revision diff | Done |
| Smart scraping pipeline | Done |
| Grant indexing to Pinecone | Done |

---

*Built to revolutionize how researchers fund the future.*
