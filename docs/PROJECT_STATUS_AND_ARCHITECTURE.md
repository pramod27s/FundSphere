# FundSphere: Complete System Architecture & Operational Status

*Last updated: 2026-05-16*

---

## 1. Executive Summary

**FundSphere** is an automated platform for discovering, indexing, and recommending academic and institutional funding opportunities. It operates on a three-tier microservices architecture:

1. **Frontend (Client)** — React 18 / Vite / TypeScript, styled with Tailwind CSS + Framer Motion
2. **Core Backend (Transactional)** — Java 17 / Spring Boot, JWT auth, PostgreSQL via JPA
3. **AI Service (Scraping, RAG, Proposal Analysis)** — Python 3 / FastAPI, Firecrawl, Pinecone, Google Gemini

All three tiers are in production-ready condition and communicating end-to-end.

---

## 2. Directory Map & Component Inventory

### A. AI Service (`/ai-service`) — Python + FastAPI

**54 source files across 4 modules.** FastAPI server mounts three routers: RAG, Proposal, and a health check. All internal endpoints require the `X-API-KEY` header (enforced by `internal_api_key_middleware`).

#### Root-level utilities
| File | Purpose |
|---|---|
| `main.py` | FastAPI entry point; registers RAG and Proposal routers; `startup` event initialises Pinecone |
| `smart_scheduler.py` | Async daemon — polls Firecrawl on a cron, POSTs discovered grants to Java at `POST /api/grants` |
| `firecrawl_scraper.py` | Wraps Firecrawl SDK with exponential-backoff retry logic; requires `FIRECRAWL_API_KEY` |
| `index_all_grants.py` | Admin script — bulk-fetches all grants from PostgreSQL and upserts into Pinecone |
| `rename_index.py` | Utility for migrating Pinecone index names |
| `test_ai_fetch.py` / `test_upsert.py` | Integration smoke tests for the AI ↔ Java bridge and vector upsert pipeline |
| `scraper_state.json` | Persisted Firecrawl pagination state across scheduler restarts |

#### RAG Module (`/ai-service/rag/`)
| File | Purpose |
|---|---|
| `routes.py` | `POST /rag/index-grant`, `POST /rag/search`, `POST /rag/recommend` |
| `config.py` | Centralised env-var loading (Pinecone key, index name, embedding model, etc.) |
| `pinecone_client.py` | Pinecone SDK wrapper — index init, dimension validation, batch upsert |
| `indexer.py` | Converts Grant JSON → dense embedding vectors; delegates to `pinecone_client` |
| `document_builder.py` | Merges `Title + Description + Eligibility + Tags` into a single LLM-optimised string |
| `filters.py` | Translates user params (country, institution type, funding range) into Pinecone metadata filters |
| `query_expander.py` | LLM-powered query expansion ("Cancer research" → "Oncology, clinical trials, metastasis…") |
| `hyde.py` | Hypothetical Document Embeddings — generates a synthetic ideal-grant document to improve recall |
| `llm_judge.py` | Post-retrieval reranker: LLM scores fetched grants against the researcher's profile and query |
| `profile_builder.py` | Embeds researcher profile attributes for passive "For You" recommendations |
| `recommender.py` | Pipeline orchestrator: `query_expander → indexer → llm_judge → ranked results` |
| `schemas.py` | Pydantic request/response models for RAG endpoints |
| `springboot_client.py` | HTTP utility for Python → Java callbacks |

#### Proposal Assistant Module (`/ai-service/proposal/`)
| File | Purpose |
|---|---|
| `routes.py` | `POST /proposal/analyze` — multipart upload (proposal PDF + guidelines PDF) |
| `schemas.py` | Pydantic models: `SectionFeedback`, `ProposalAnalysisResponse` |
| `pdf_extractor.py` | PDF text extraction; pdfplumber primary, pypdf fallback |
| `section_splitter.py` | LLM-based section identifier (Abstract, Methodology, Budget, Timeline, …) |
| `analyzer.py` | Two-mode analysis engine: `analyze_simple` (1 LLM call, ~10 s) and `analyze_deep` (parallel per-section eval, ~30–90 s) |
| `gemini_client.py` | Async Gemini 2.5 Pro/Flash wrapper; auto-falls back to `gemini-2.5-flash` on 429 quota errors |
| `rubric.py` | Section-scoring rubric definitions |
| `analysis_cache.py` | In-memory caching layer to avoid re-running identical analysis requests |

#### Evaluation Module (`/ai-service/eval/`)
| File | Purpose |
|---|---|
| `auto_eval.py` | Automated evaluation of recommendation quality against labelled ground truth |
| `run_eval.py` | Test harness to execute evaluation suites |
| `suggest_labels.py` | LLM-assisted label generation for building ground-truth datasets |

---

### B. Core Backend (`/CoreBackend`) — Java 17 + Spring Boot

**54 Java source files.** Server runs on port `8080`. Hibernate `ddl-auto=update` manages schema migrations automatically.

#### Security Layer
| File | Purpose |
|---|---|
| `SecurityConfig.java` | JWT filter chain; CORS policy; route authorization rules |
| `JwtService.java` | Access-token and refresh-token generation, validation, and rotation |
| `JwtAuthenticationFilter.java` | Per-request Bearer token extraction and principal injection |
| `CustomUserDetailsService.java` | Loads `AppUser` from DB for Spring Security |
| `UserPrincipal.java` | Custom `Authentication` principal exposing `userId` |
| `GlobalExceptionHandler.java` | `@RestControllerAdvice` — maps exceptions to structured JSON errors with stack-trace logging |

#### Controllers (6 REST endpoints)
| Controller | Routes |
|---|---|
| `AuthController` | `POST /api/auth/register`, `/login`, `/refresh` |
| `GrantController` | `GET /api/grants`, `POST /api/grants`, `GET /api/grants/{id}` |
| `ResearcherController` | `GET/PUT /api/researcher/profile` |
| `SavedGrantController` | `GET /api/saved-grants`, `GET /ids`, `POST /{id}`, `DELETE /{id}` |
| `ProposalController` | `POST /api/proposal/analyze` (JWT-protected, multipart) |
| `AiBridgeController` | Relay endpoint forwarding frontend RAG requests to the AI Service |

#### Services
| Service | Responsibility |
|---|---|
| `AuthService` | Credential verification, token issuance, refresh-token rotation |
| `GrantService` | Checksum-based upsert of incoming scraped grants; exposes `mapToResponse()` (public) |
| `GrantIndexingService` | Async `CompletableFuture` wrapper that calls Python's `/rag/index-grant` after a grant is saved |
| `ReindexSweeper` | Scheduled background task — periodically re-indexes stale grants into Pinecone |
| `ResearcherService` | Researcher profile CRUD |
| `SavedGrantService` | Idempotent save (no-op if already saved); N+1-safe fetch via `join fetch` |
| `AiServiceClient` | Internal HTTP client — injects `X-API-KEY`; handles multipart forwarding for Proposal analysis |
| `AiProfileMapper` | Transforms `ResearcherProfile` attributes into the `AiUserProfileResponse` DTO for embedding |

#### Entities (5 JPA tables)
| Entity | Table | Key Columns |
|---|---|---|
| `AppUser` | `app_users` | `id`, `email`, `password_hash`, `role` |
| `Researcher` | `researchers` | `id`, `user_id` (FK), profile fields (field, position, funding prefs) |
| `Grant` | `grants` | `id`, `url`, `checksum`, `deadline`, `funding_amount`, `provider` |
| `SavedGrant` | `saved_grants` | Unique `(user_id, grant_id)`, indexed on both columns |
| `RefreshToken` | `refresh_tokens` | `token`, `user_id`, `expires_at`, `revoked` |

#### DTOs
- **Auth:** `LoginRequest`, `RegisterRequest`, `AuthResponse`, `RefreshTokenRequest`
- **AI Bridge:** `AiGrantIndexableResponse`, `AiKeywordCandidateResponse`, `AiKeywordSearchRequest`, `AiUserProfileResponse`
- **Domain:** `GrantRequest`, `GrantResponse`, `ResearcherRequest`, `ResearcherResponse`, `SavedGrantResponse`, `SavedGrantUpdateRequest`

#### Enums (7)
`Role`, `UserType`, `GrantType`, `PrimaryField`, `EducationLevel`, `Position`, `SavedGrantStatus`

---

### C. Frontend (`/frontend`) — React 18 + TypeScript + Vite

**58 source files.** Navigation is **state-based** (not React Router) — a `currentPage` union type in `App.tsx` controls which page renders. Build output: ~448 KB JS, ~79 KB CSS.

#### App Shell
| File | Purpose |
|---|---|
| `App.tsx` | Root shell — state machine for `currentPage`, auth guard, splash screen, `auth:unauthorized` event listener |
| `context/ResearcherContext.tsx` | React Context providing researcher profile and onboarding state globally |

#### Components

**Auth (`auth/`)**
- `AuthPage.tsx` — wrapper switching between Login and Register
- `Login.tsx`, `Register.tsx` — forms with `isLoading` / `errorMsg` state
- `PasswordStrengthMeter.tsx` — real-time password rule feedback

**Common (`common/`)**
- `AnimatedLogo.tsx` — globe with dual orbital rings and ripple-dot animations
- `SplashScreen.tsx` — initial loading screen with brand animation
- `TopLoadingBar.tsx` — global progress indicator for async operations
- `UserAvatarMenu.tsx` — avatar dropdown (initials derived from session); links to Profile, Saved Grants, Proposal Assistant
- `BackendErrorScreen.tsx` — full-page error state for backend connectivity failures
- `ScrollToTopButton.tsx`, `GlossaryText.tsx`, `CustomSelect.tsx`
- `MatchBreakdown.tsx` — per-field grant match score visualisation
- `FreshnessBadge.tsx` — data recency indicator on grant cards
- `ProviderUpdatedInfo.tsx` — grant provider metadata chip
- `WhatsAppShareButton.tsx` — one-tap grant sharing via WhatsApp

**Grant Discovery (`discovery/`)**
- `GrantDiscovery.tsx` — main search interface; Browse and AI Match modes; Show-count dropdown (6/12/20/50/100; capped at 20 in AI mode)
- `GrantList.tsx` — paginated card list with shimmer skeleton, `BookmarkButton` (calls `useSavedGrants`)
- `GrantDetailsModal.tsx` — full-detail modal; Save/Saved toggle; 3-column stat grid
- `FilterSidebar.tsx` — sidebar with icon-tile header, active-filter count pills, gradient checkboxes

**Onboarding (`onboarding/`)**
- `OnboardingWizard.tsx` + 8 step components: UserType → AccountInfo → ResearchArea → Experience → FundingPrefs → Location → Organization → Notifications

**Profile (`profile/`)**
- `ResearcherProfile.tsx` — hero section, `StatCard`/`DetailCard` helpers, completion-progress bar, notification timeline

**Proposal Assistant (`proposal/`)**
- `WritingProposal.tsx` — full PDF-upload + analysis UI: drag-drop dual file zones, Quick/Deep mode toggle, animated SVG score ring, missing-sections warning, sortable section accordion (missing → weak → strong), Markdown export, Print-to-PDF (via `window.print()` + `@media print`), revision flow with `DiffSummaryCard` showing score delta and per-section transitions

**Saved Grants (`saved-grants/`)**
- `SavedGrants.tsx` — server-backed bookmark list; per-card Unsave button; `GrantDetailsModal` on click; animated empty state

#### Services
| Service | Responsibility |
|---|---|
| `apiClient.ts` | Axios instance; injects Bearer token; intercepts 401/403 for silent token refresh; skips `Content-Type` override when body is `FormData` |
| `authService.ts` | Login, register, refresh, `loadSession()`, `saveSession()`, `clearSession()` |
| `discoveryService.ts` | Grant search, browse, and filter API calls |
| `proposalService.ts` | `analyzeProposal()`, `formatAnalysisAsMarkdown()`, `downloadAnalysisAsMarkdown()`, `diffAnalyses()` |
| `researcherService.ts` | Researcher profile read/update |
| `savedGrantsService.ts` | Save/unsave; maps `GrantResponse` → `DiscoveryGrant` |

#### Custom Hook
- `useSavedGrants.ts` — server-backed saved grants with optimistic toggle + rollback on failure; one-time localStorage migration on first run; exports `useSavedGrantIds()` lightweight variant

#### Utilities
`formatDeadline.ts`, `formatFunding.ts`, `glossary.ts`, `passwordStrength.ts`, `shareGrant.ts`

---

## 3. Data Pipelines & Operational Flows

### Flow 1: Automated Grant Ingestion
```
smart_scheduler  →  Firecrawl API  →  POST /api/grants (Java)
                                           ↓
                                     GrantService.saveOrUpdateGrant()
                                     (checksum comparison → upsert)
                                           ↓
                                     GrantIndexingService (async)
                                           ↓
                                     AiServiceClient → POST /rag/index-grant (Python)
                                           ↓
                                     indexer → Pinecone upsert
```

### Flow 2: AI Grant Discovery (RAG)
```
React (GrantDiscovery)
  → POST /api/grants/search (Java, JWT)
  → AiBridgeController → AiServiceClient → POST /rag/search (Python, X-API-KEY)
  → query_expander → HyDE → Pinecone similarity search
  → filters → llm_judge (Gemini rerank)
  → ranked GrantResponse[] → React card list
```

### Flow 3: Proposal Assistant
```
React (WritingProposal)
  → POST /api/proposal/analyze  multipart (Java, JWT)
  → ProposalController → AiServiceClient (LinkedMultiValueMap multipart)
  → POST /proposal/analyze (Python, X-API-KEY)
  → pdf_extractor → section_splitter → analyzer (simple or deep)
  → gemini_client → Gemini 2.5 Pro / Flash fallback
  → ProposalAnalysisResponse JSON
  → proposalService.ts decodes → score ring + section accordion + diff card
```

### Flow 4: JWT Security Lifecycle
```
Login → Java issues access token (short-lived) + refresh token (long-lived)
React stores tokens → apiClient injects Bearer on every request
403 received → apiClient pauses request → silent POST /auth/refresh
             → new access token → retry original request (transparent to user)
auth:unauthorized event → App.tsx → redirect to login
```

### Flow 5: Saved Grants (Server-Backed)
```
GrantList / SavedGrants
  → useSavedGrants.toggleSave(grantId)  [optimistic UI update]
  → POST or DELETE /api/saved-grants/{id}  (Java, JWT)
  → SavedGrantService  (idempotent, unique constraint at DB level)
  → rollback client state on HTTP error
Legacy migration: on first load, localStorage fundsphere.saved.grants
  entries are uploaded to the server, then localStorage is cleared.
```

---

## 4. Completed Features & Resolved Issues

| Area | Status |
|---|---|
| RAG pipeline (Pinecone indexing, query expansion, HyDE, LLM reranking) | Complete |
| Proposal Assistant (PDF upload, Gemini analysis, diff/revision flow) | Complete |
| Saved Grants — PostgreSQL persistence with optimistic UI | Complete |
| JWT auth with silent refresh and `auth:unauthorized` auto-redirect | Complete |
| Onboarding wizard (8-step researcher profile) | Complete |
| Animated logo, glassmorphic UI, shimmer skeletons | Complete |
| Markdown export + Print-to-PDF for proposal reports | Complete |
| RAG evaluation harness (`eval/`) with auto-eval and label suggestion | Complete |
| `ReindexSweeper` — scheduled background re-indexing of stale grants | Complete |
| `GlobalExceptionHandler` with stack-trace logging | Complete |
| `apiClient.ts` FormData multipart fix (no forced `Content-Type`) | Complete |
| Spring Boot multipart AiServiceClient fix (`LinkedMultiValueMap`) | Complete |
| Gemini 2.5 Pro → Flash quota fallback | Complete |
| WhatsApp grant sharing, Glossary tooltips, FreshnessBadge UI | Complete |

---

## 5. Build Verification

| Layer | Command | Result |
|---|---|---|
| Frontend | `npx tsc --noEmit` + `vite build` | Clean; 448 KB JS / 79 KB CSS |
| CoreBackend | `mvn clean compile` | Clean; 54 source files |
| AI Service | FastAPI startup + `/proposal/health` | 200 OK |

---

## 6. Environment Variables Required

| Service | Variable | Purpose |
|---|---|---|
| AI Service | `FIRECRAWL_API_KEY` | Web scraping credits |
| AI Service | `PINECONE_API_KEY`, `PINECONE_INDEX_NAME` | Vector DB |
| AI Service | `GEMINI_API_KEY` | Proposal analysis LLM |
| AI Service | `PROPOSAL_GEMINI_MODEL` / `PROPOSAL_GEMINI_FALLBACK_MODEL` | Model selection |
| AI Service | `INTERNAL_API_KEY` | Shared secret with Java (`X-API-KEY` header) |
| CoreBackend | `SPRING_DATASOURCE_URL/USERNAME/PASSWORD` | PostgreSQL |
| CoreBackend | `JWT_SECRET` | Token signing |
| CoreBackend | `AI_SERVICE_URL` | Python FastAPI base URL |
| CoreBackend | `INTERNAL_API_KEY` | Must match AI Service value |

---

## 7. Known Constraints

- Free-tier `gemini-2.5-pro` has 0 RPD quota; traffic is served by `gemini-2.5-flash` via the auto-fallback.
- Firecrawl credits are finite — `smart_scheduler` rate-limits itself via `scraper_state.json`.
- Pinecone free tier limits index size; `ReindexSweeper` avoids redundant upserts via checksum comparison.
- `ddl-auto=update` is used for development convenience; production deployment should migrate to Flyway/Liquibase.
