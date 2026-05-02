# FundSphere: Complete System Architecture & Operational Status

## 1. Executive Summary

**FundSphere** is an advanced, automated platform designed to discover, index, and recommend academic and institutional funding opportunities.
It operates on a highly decentralized microservices architecture integrating web scraping (via Firecrawl), a relational persistence layer (PostgreSQL), and an AI-driven Semantic Search engine backed by a Vector Database (Pinecone).

The application is broken down into three tightly coupled domains:

1. **Frontend (Client)**: React/Vite/TypeScript.
2. **Core Backend (Transactional)**: Java/Spring Boot.
3. **AI Service (Scraping & RAG)**: Python/FastAPI.

---

## 2. Granular System Architecture & Directory Map

### A. AI Web Scraper & Vector Service (`/ai-service`) - Python + FastAPI

**Core Responsibility:** Handles continuous data ingestion from the internet, structures unstructured HTML, generates text embeddings via LLMs, manages Pinecone insertion, and evaluates search queries.

- **Root Scripts & Config:**
  - **`run_scraper.bat`**: Windows entry point to spawn the Python virtual environment and launch the scheduler.
  - **`main.py`**: The FastAPI server. Mounts the API routers, establishes the `internal_api_key_middleware` (mandating the `X-API-KEY` header for internal Java-to-Python requests), and handles startup events.
  - **`smart_scheduler.py`**: The asynchronous daemon. Runs periodically, querying the internet via the Firecrawl API, parsing the payload, and sending it as structured JSON to the Java Backend via `/api/grants`.
  - **`firecrawl_scraper.py`**: Encapsulates the network calls directly to Firecrawl (requires `FIRECRAWL_API_KEY`).
  - **`index_all_grants.py`**: An administrative fallback script that requests _all_ existing grants from PostgreSQL and bulk-inserts them into Pinecone.
  - **`requirements.txt`**: Standard Python dependency file.
  - **`scraper_state.json`**: Persists the last scraped state and hashes to avoid redundant processing.

- **Evaluation & Testing (`/ai-service/eval/`):**
  - **`auto_eval.py` & `run_eval.py`**: Scripts for automating accuracy testing of the RAG pipeline.
  - **`testset.json` & `README.md`**: Evaluation datasets and instructions for testing model retrieval and relevance.

- **The RAG Engine (`/ai-service/rag/`):**
  - **`__init__.py`**: Python module initializer.
  - **`config.py`**: Loads environment variables into Pydantic models for type-safe configuration.
  - **`routes.py`**: Exposes FastAPI endpoints mapping to RAG services (e.g., `POST /rag/index-grant`, `POST /rag/recommend`).
  - **`pinecone_client.py`**: Wraps the Pinecone SDK, managing index initialization, embedding logic, reranker integration, and batch upsertions.
  - **`indexer.py`**: Converts raw JSON Grant items into dense embedding vectors using an Embedding Model (e.g., OpenAI or HuggingFace) before passing them to the Pinecone client.
  - **`document_builder.py`**: Constructs the unified context strings (e.g., merging "Title + Description + Eligibility" into a single string to optimize the LLM's spatial understanding).
  - **`filters.py`**: Parses exact-match user parameters (Country, Institution Type) into query metadata that Pinecone natively understands for pre-filtering. Also implements alias normalization.
  - **`hyde.py`**: Implements Hypothetical Document Embeddings (HyDE). Asks an LLM to generate a hypothetical perfect grant to improve retrieval accuracy.
  - **`query_expander.py`**: Uses an LLM to take a simple user query ("Cancer research") and semantically expand it ("Oncology, tumors, metastasis, clinical trials") before hitting the Vector DB.
  - **`llm_judge.py`**: Used strictly to generate explainable rationales for matches, improving user trust without hard-filtering results.
  - **`profile_builder.py`**: Converts the Researcher's profile attributes into formatted strings for embeddings to enable passive recommendations.
  - **`recommender.py`**: The main orchestrator. Fuses semantic, keyword, and structured channels (RRF), activates the reranker, applies the 5-signal business score, and returns the final list of grants.
  - **`schemas.py`**: Pydantic models enforcing strict JSON validation at the API boundaries.
  - **`springboot_client.py`**: Utility for Python to ping Java endpoints (closing the microservice loop for fetching profiles and keyword search hits).

### B. Core Backend (`/CoreBackend`) - Java + Spring Boot

**Core Responsibility:** The system of record. Manages secure user sessions (JWT), stores authoritative transactional data in PostgreSQL, and acts as the broker between the Frontend and the Python AI service.

- **Configuration & Setup:**
  - **`pom.xml` / `mvnw`**: Maven build scripts managing dependencies (Spring Web, Spring Security, Spring Data JPA, Postgres Driver).
  - **`src/main/resources/application.properties`**: Environment variables configuring Database URIs, Hibernate dialects, JWT Secrets, server port (`8080`), and AI Service URLs.

- **Exceptions (`/exception/`):**
  - **`GlobalExceptionHandler.java`**: Catches unhandled exceptions and formats standard JSON error responses.

- **Domain Logic & Services (`/service/`):**
  - **`GrantService.java`**: The core data manager. Receives data from the Python scraper, computes checksums, saves to DB, and asynchronously triggers Pinecone indexing. Also implements Java-side keyword search.
  - **`AiServiceClient.java`**: The internal REST client. Configured to inject the `X-API-KEY` into the HTTP Headers to bypass the Python FastAPI middleware lock.
  - **`AuthService.java`**: Handles business logic for user registration, login, and JWT generation/validation.
  - **`ResearcherService.java`**: Manages CRUD operations for the Researcher profile entities.
  - **`AiProfileMapper.java`**: Utility to map internal database Researcher entities to the structured payloads expected by the AI Service.

- **Repositories (`/repository/`):**
  - **`AppUserRepository.java`, `GrantRepository.java`, `RefreshTokenRepository.java`, `ResearcherRepository.java`**: Spring Data JPA interfaces interacting directly with PostgreSQL for standard CRUD and complex queries.

- **Security Configuration (`/security/`):**
  - **`SecurityConfig.java`**: Defines filter chains, CORS policies, and interceptors.
  - **`JwtAuthenticationFilter.java` & `JwtService.java`**: Intercepts incoming requests to validate 'Bearer' JWTs and handles token generation and parsing.
  - **`CustomUserDetailsService.java` & `UserPrincipal.java`**: Adapts internal User entities to Spring Security's principal interfaces.

### C. Frontend (`/frontend`) - React + TypeScript + Vite

**Core Responsibility:** The UI/UX presentation layer. Consumes back-end data, manages local UI state, and handles token lifecycles and navigation.

- **Build & Config:**
  - **`package.json` & `vite.config.ts`**: NPM scripts and Vite build rules.
  - **`tailwind.config.js`**: Utility styling framework setup.
  - **`tsconfig*.json`**: TypeScript compiler configurations.
  - **`eslint.config.js`**: Code linting rules.

- **React Core (`src/`):**
  - **`main.tsx`**: Bootstraps the React DOM.
  - **`App.tsx`**: Houses the React Router. Controls guarded routes. Contains global fallback logic to catch JWT authorization failures (pushing the user to `/login`).
  - **`App.css` & `index.css`**: Global stylesheets injecting Tailwind and custom variables.

- **Services (`/src/services/`):**
  - **`apiClient.ts`**: The global Axios instance. Intercepts `401 Unauthorized` and `403 Forbidden` errors to attempt background `/refresh` token requests to keep sessions alive transparently.
  - **`authService.ts`**: Maps login and registration logic to Java's auth controllers.
  - **`discoveryService.ts`**: Fetches recommended grants and details from the backend endpoints.
  - **`researcherService.ts`**: Handles fetching and updating user profiles.

- **Hooks (`/src/hooks/`):**
  - **`useSavedGrants.ts`**: Custom React hook managing the state of bookmarked grants locally and remotely.

- **Components (`/src/components/`):**
  - **`auth/`** (`AuthPage.tsx`, `Login.tsx`, `Register.tsx`): Registration and Login components with real-time feedback.
  - **`common/`** (`AnimatedLogo.tsx`, `CustomSelect.tsx`, `SplashScreen.tsx`, `UserAvatarMenu.tsx`): Shared UI primitives and visual elements.
  - **`discovery/`** (`GrantDiscovery.tsx`, `GrantList.tsx`, `FilterSidebar.tsx`, `GrantDetailsModal.tsx`): The main UI consuming the RAG pipeline. Renders the AI-evaluated grant cards and detailed modals.
  - **`onboarding/`** (`OnboardingWizard.tsx` and `steps/*`): Multi-step form to collect a new user's profile, interests, and preferences upon first login.
  - **`profile/`** (`ResearcherProfile.tsx`): User settings. Manages fields and custom Avatar uploading (reading files using `FileReader` and saving base64 strings to `localStorage`).
  - **`saved-grants/`** (`SavedGrants.tsx`): Displays grants the user has bookmarked.
  - **`proposal/`** (`WritingProposal.tsx`): UI placeholder/component for assisting users in drafting grant proposals.

---

## 3. Data Pipelines & Operational Flow

### Flow 1: Automated Ingestion (Scraping -> DB -> Vector Sync)

1. Python's `smart_scheduler` activates and spends Firecrawl credits to parse a funding website.
2. It structures the data into a schema and POSTs it to `http://localhost:8080/api/grants`.
3. Java's `GrantService` checks PostgreSQL. If the URL is new, it saves the entity.
4. Java asynchronously explicitly invokes `AiServiceClient.indexGrant()`, passing the new ID and attaching the `X-API-KEY`.
5. Python's `/rag/index-grant` receives the signal, pulls the data, embeds it into numeric vectors, and UPSERTs it into Pinecone.

### Flow 2: JWT Security Lifecycle

1. User logs in manually via the React Frontend.
2. Java verifies credentials against PostgreSQL and issues short-lived Access Tokens and long-lived Refresh Tokens.
3. React stores these in memory/localStorage. `apiClient.ts` auto-injects them into headers on every subsequent fetch.
4. If a session expires, Spring Boot throws a `403 Forbidden`. React's interceptor catches this, pauses the failed request, silently fetches a new token, and retries the request without interrupting the user.

---
