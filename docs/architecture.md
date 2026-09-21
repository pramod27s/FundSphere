# FundSphere — Architecture Diagrams

ASCII-art reference for the two AI-powered subsystems: the **RAG-based grant matching** engine and the **AI Proposal Assistant**. All diagrams render directly in any Markdown viewer — no extensions or plugins required.

> Best viewed in a monospace-rendering Markdown reader (GitHub, VS Code, Obsidian, plain `less`).

---

## 1 · RAG — AI Grant Matching

### 1.1 End-to-end flow

```
                          ┌──────────────────┐
                          │     USER         │  clicks "AI Match"
                          └────────┬─────────┘
                                   │
                                   ▼
                          ┌──────────────────┐
                          │ React frontend   │
                          │ GrantDiscovery   │
                          └────────┬─────────┘
                                   │
              POST /api/researchers/me/matches    (JWT bearer)
              { query, topK }
                                   │
                                   ▼
                  ┌─────────────────────────────────┐
                  │ Spring Boot · CoreBackend       │
                  │ AiBridgeController              │
                  └──────┬───────────────────┬──────┘
                         │                   │
                         │ SELECT profile    │ POST /rag/recommend
                         ▼                   │  (X-API-KEY)
                  ┌──────────────┐           │
                  │ PostgreSQL   │           │
                  │ researchers  │           │
                  └──────────────┘           │
                                             ▼
              ┌──────────────────────────────────────────────────┐
              │ FastAPI · ai-service · rag/routes.py             │
              │                                                  │
              │   ┌──────────────┐         ┌──────────────┐      │
              │   │   Pinecone   │         │  PostgreSQL  │      │
              │   │   semantic   │         │   keyword    │      │
              │   │    search    │         │    search    │      │
              │   └──────┬───────┘         └──────┬───────┘      │
              │          │ top-N candidates       │              │
              │          └────────────┬───────────┘              │
              │                       ▼                          │
              │             ┌──────────────────┐                 │
              │             │  recommender.py  │                 │
              │             │  RRF + dynamic   │                 │
              │             │  score blending  │                 │
              │             └────────┬─────────┘                 │
              │                      │ ranked top-K              │
              │                      ▼                           │
              │             ┌──────────────────┐                 │
              │             │ gemini_client.py │                 │
              │             │  Gemini 2.5 Pro  │                 │
              │             │  → Flash on 429  │                 │
              │             │  one rationale   │                 │
              │             │  per grant       │                 │
              │             └────────┬─────────┘                 │
              └──────────────────────│──────────────────────────-┘
                                     │
                       ranked GrantResponse[]
                       (score, eligibility, rationale)
                                     │
                                     ▼
                          (back through Spring Boot
                           and React → render cards)
```

### 1.2 Hybrid scoring breakdown

The final per-grant score is a weighted blend of **five** signals plus small preference bonuses. Weights live in `ai-service/rag/config.py` (every one env-overridable) and can be **auto-tuned** against the eval harness — see §5. Expired grants are filtered out before ranking, not merely penalized.

```
            ┌─────────────────────────────────┐
            │   Researcher profile + query    │
            └────────────────┬────────────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
   ┌────────────────────┐         ┌────────────────────┐
   │  Semantic Search   │         │  Keyword Search    │
   │  (Pinecone hybrid) │         │  (PostgreSQL FTS)  │
   └─────────┬──────────┘         └─────────┬──────────┘
             │ top-N semantic               │ top-N keyword
             └──────────────┬───────────────┘
                            ▼
            ┌─────────────────────────────────┐
            │   Reciprocal Rank Fusion (RRF)  │
            └────────────────┬────────────────┘
                             │ fused candidate pool
                             ▼
            ┌─────────────────────────────────┐
            │  Cross-encoder rerank           │
            │  (Pinecone bge-reranker-v2-m3)  │
            └────────────────┬────────────────┘
                             ▼
            ┌─────────────────────────────────┐
            │   5-signal score blend          │
            │   (per applicant-type preset    │
            │    when ENABLE_SEGMENT_WEIGHTS)  │
            ├─────────────────────────────────┤
            │   35%   Semantic similarity     │
            │   25%   Eligibility fit  (*)    │
            │   15%   Keyword match           │
            │   15%   Funding fit             │
            │   10%   Deadline freshness      │
            │  +.05   grant-type pref match   │
            │  +.05   career-stage match      │
            └────────────────┬────────────────┘
                             │ (*) eligibility applies hard guards now:
                             │     PhD-required · min-experience · citizenship
                             ▼
            ┌─────────────────────────────────┐
            │  Expired grants filtered out    │
            │  (deadline passed → removed,    │
            │   EXCLUDE_EXPIRED_GRANTS=on)    │
            └────────────────┬────────────────┘
                             │ score clamped to [0,1]
                             ▼
                   Top-K cut → Gemini rationale
                             │
                             ▼
                     Ranked AI results
```

### 1.3 Key files

```
LAYER                FILE                                                    ROLE
─────────────────────────────────────────────────────────────────────────────────────────────────
Frontend             src/components/discovery/GrantDiscovery.tsx             AI Match button + state
Frontend             src/services/discoveryService.ts                        API client + response mapping
CoreBackend          controller/AiBridgeController.java                      JWT-guarded entry
CoreBackend          service/AiServiceClient.java                            X-API-KEY internal hop
AI-Service           rag/routes.py                                           POST /rag/recommend
AI-Service           rag/recommender.py                                      RRF + rerank + 5-signal blend + expired filter
AI-Service           rag/filters.py                                          eligibility/funding/freshness + grant-type/career fits
AI-Service           rag/config.py                                           weights + feature flags (all env-overridable)
AI-Service           rag/gemini_client.py                                    Pro → Flash auto-fallback
AI-Service           eval/auto_eval.py · eval/tune.py                        measure NDCG + auto-tune weights (see §5)
Vector DB            Pinecone · namespace grants                             Grant + researcher embeddings
```

---

## 2 · AI Proposal Assistant

### 2.1 Quick mode (~10 s)

```
   proposal.pdf  ──┐
                   │
                   ├──► pdf_extractor.py ──► both texts
                   │       (pdfplumber +
                   │        pypdf fallback)
   guidelines.pdf ─┘                              │
                                                  ▼
                                       ┌──────────────────────┐
                                       │  1 Gemini LLM call   │
                                       │  prompt: score +     │
                                       │  per-section feedback│
                                       └──────────┬───────────┘
                                                  │
                                                  ▼
                                       ProposalAnalysisResponse
                                       { score, sections[],
                                         summary }
                                            ~10 seconds
```

### 2.2 Deep mode (~30–90 s)

```
   proposal.pdf  ──┐
                   │
                   ├──► pdf_extractor.py ──► proposal_text
                   │                     ──► guidelines_text
   guidelines.pdf ─┘
                              │
                              ▼
                  ┌─────────────────────────┐
                  │  section_splitter.py    │
                  │  (LLM call)             │
                  │  Identifies canonical   │
                  │  sections in proposal   │
                  └────────────┬────────────┘
                               │
                               ▼
       ┌────────────────────────────────────────────────────┐
       │  Sections detected:                                │
       │    Abstract · Background · Methodology · Budget    │
       │    Timeline · Outcomes · References · …            │
       └────────────────────────┬───────────────────────────┘
                                │ fan-out
                                │ (parallel async — one
                                │  Gemini call per section)
                                ▼
              ┌─────────────────────────────────────┐
              │  For each section, in parallel:     │
              │    • Compare section vs FULL        │
              │      guidelines text                │
              │    • Gemini scores compliance,      │
              │      strengths, gaps                │
              │    • Returns SectionFeedback        │
              └────────────────┬────────────────────┘
                               │
                               ▼
                  Collect SectionFeedback[]
                               │
                               ▼
                  ┌─────────────────────────┐
                  │ Missing-section detector│
                  │ canonical_set − present │
                  │ → flags omitted required│
                  │   sections (e.g. Budget,│
                  │   References)           │
                  └────────────┬────────────┘
                               │
                               ▼
                  ┌─────────────────────────┐
                  │  LLM summary writer     │
                  │  + top 3 recommendations│
                  └────────────┬────────────┘
                               │
                               ▼
                  ProposalAnalysisResponse
                  { score, sections[],
                    missing[], summary,
                    recommendations[] }
                       ~30–90 seconds
```

### 2.3 Revision flow (compare two analyses)

After viewing results, the user can upload a revised proposal. The frontend computes the diff locally — no extra LLM cost.

```
   Analysis v1 (baseline)            Analysis v2 (revision)
              │                                │
              └────────────────┬───────────────┘
                               │
                               ▼
              ┌─────────────────────────────────┐
              │ diffAnalyses(v1, v2)            │
              │ in proposalService.ts           │
              └─────────────────┬───────────────┘
                                │
       ┌────────────────────────┼────────────────────────────┐
       │                        │                            │
       ▼                        ▼                            ▼
   Score delta          Per-section transitions       Section-presence
   e.g. 68 → 84 +16     • improved                    transitions
                        • regressed                   • newly_added
                        • unchanged                   • newly_missing
                                                      • resolved_missing
       │                        │                            │
       └────────────────────────┼────────────────────────────┘
                                ▼
                       <DiffSummaryCard />
                       rendered in WritingProposal.tsx
```

### 2.4 Key files

```
LAYER                FILE                                                    ROLE
─────────────────────────────────────────────────────────────────────────────────────────────────
Frontend             src/components/proposal/WritingProposal.tsx             Drag-drop + mode toggle + results
Frontend             src/services/proposalService.ts                         Multipart POST, MD export, diff
CoreBackend          controller/ProposalController.java                      JWT-guarded, 30 MB multipart
CoreBackend          service/AiServiceClient.java (analyzeProposal)          Multipart forwarder
AI-Service           proposal/routes.py                                      POST /proposal/analyze
AI-Service           proposal/pdf_extractor.py                               pdfplumber → pypdf fallback
AI-Service           proposal/section_splitter.py                            LLM section identifier
AI-Service           proposal/analyzer.py                                    analyze_simple / analyze_deep
AI-Service           proposal/gemini_client.py                               Async JSON wrapper + fallback
AI-Service           proposal/schemas.py                                     Pydantic response models
```

---

## 3 · Cross-service auth pattern

Both subsystems use the same two-hop trust chain.

```
   ┌─────────┐
   │  USER   │ (browser)
   └────┬────┘
        │  Authorization: Bearer <JWT>
        ▼
   ┌──────────────────────────┐
   │  React frontend          │
   └────┬─────────────────────┘
        │  Authorization: Bearer <JWT>
        ▼
   ┌──────────────────────────┐
   │  Spring Boot CoreBackend │
   │  • Validates JWT          │
   │  • Extracts user_id       │
   │  • Hydrates profile from  │
   │    PostgreSQL             │
   └────┬─────────────────────┘
        │  X-API-KEY: <shared internal secret>
        ▼
   ┌──────────────────────────┐
   │  FastAPI AI-Service      │
   │  • Trusts X-API-KEY,      │
   │    no per-user check      │
   │  • Holds all the          │
   │    sensitive credentials  │
   └────┬─────────────────────┘
        │
        ▼
   ┌──────────────────────────┐
   │  Pinecone · Gemini ·     │
   │  PostgreSQL              │
   │  (keys never leave server)│
   └──────────────────────────┘
```

---

## 4 · Design gotchas captured here

- **`MultipartBodyBuilder` is incompatible** with `spring-boot-starter-webmvc` (the non-reactive stack CoreBackend uses) — it transitively requires `org.reactivestreams.Publisher`. We use `LinkedMultiValueMap<String, Object>` in `AiServiceClient.analyzeProposal()` instead.

- **Gemini 2.5 Pro free-tier daily quota = 0.** The auto-fallback to `gemini-2.5-flash` on 429 is what actually serves production traffic. Both `rag/gemini_client.py` and `proposal/gemini_client.py` implement this independently.

- **Pinecone uses one namespace per content type.** Grants are in `grants-v1`. Phase 3 will add `researchers-v1` for skill-based collaboration matching.

- **Spring Boot is a thin proxy** for AI traffic — it doesn't decode or reshape FastAPI's JSON. Pros: deploying an AI-service change ripples without recompiling CoreBackend. Cons: Spring Boot can't validate AI responses (acceptable for v1).

- **Per-section parallelism in Deep mode** uses `asyncio.gather` over an array of Gemini calls. Bounded by Gemini's per-key concurrency limit, not our code — tune in `analyzer.py` if rate-limited.

- **Scoring weights moved to `config.py`** (env-overridable) and were corrected to 35/25/15/15/10 (semantic/eligibility/keyword/funding/freshness). The old "buffer" slot is gone. Eligibility now applies real hard-guards (PhD-required, min-experience, citizenship) and grant-type/career-stage preference bonuses — all populated by the scraper schema + `AiProfileMapper`.

- **Expired grants are filtered out**, not just penalized (`EXCLUDE_EXPIRED_GRANTS`, default on). Grants with no/unknown deadline are kept.

- **No compile-time JSON dependency in CoreBackend.** Spring Boot 4 + `spring-boot-starter-webmvc` exposes Jackson only at *runtime*; code that parses JSON (e.g. `OrcidEnrichmentService`) deserializes into a `Map` and navigates it — importing `com.fasterxml.jackson.databind.*` fails to compile.

---

## 5 · RAG evaluation & weight tuning

Measure matching quality and auto-tune the scoring weights — without burning LLM tokens on every run. One-click via `ai-service/eval.bat` (preflight refuses to run unless CoreBackend `:8080` + ai-service `:8000` are reachable).

```
  eval.bat [1] Compare  ──►  auto_eval.py
                             • frozen test set (profiles+queries) — generated ONCE
                             • run recommender → LLM judges each candidate 0–3
                             • Recall@K / MRR / NDCG@K, baseline flags vs improved
                             └─ judgments cached → re-runs cost ~0 tokens, resumable

  eval.bat [4] Auto-tune ──►  tune.py
                             • snapshot per-candidate sub-scores ONCE (Pinecone)
                             • sweep 1000s of weight vectors = pure arithmetic
                             • prints best-NDCG weights → paste into .env
                             (zero LLM tokens; reuses the cached snapshot + labels)
```

The tuner *recommends*, it does not auto-apply — you paste the winning `WEIGHT_*` lines into `.env` and re-run `[1]` to confirm NDCG moved. **Caveat:** LLM judgments are pseudo-labels, so trust the *deltas* and confirm before shipping.

---

*Last updated 2026-05-30. Update when scoring weights/signals change, when the eval/tuner workflow changes, when scheme-aware proposal rubrics ship, or when the Pinecone namespace layout changes.*
