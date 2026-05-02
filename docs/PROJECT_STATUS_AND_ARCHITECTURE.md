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

* **Execution & Lifecycle:**
  * **`run_scraper.bat`**: Windows entry point to spawn the Python virtual environment and launch the scheduler.
  * **`main.py`**: The FastAPI server. Mounts the API routers, establishes the `internal_api_key_middleware` (mandating the `X-API-KEY` header for internal Java-to-Python requests), and handles startup events.
  * **`smart_scheduler.py`**: The asynchronous daemon. Runs periodically, querying the internet via the Firecrawl API, parsing the payload, and sending it as structured JSON to the Java Backend via `/api/grants`.
  * **`firecrawl_scraper.py`**: Encapsulates the network calls directly to Firecrawl (requires `FIRECRAWL_API_KEY`).
  * **`index_all_grants.py`**: An administrative fallback script that requests *all* existing grants from PostgreSQL and bulk-inserts them into Pinecone.

* **The RAG Engine (`/ai-service/rag/`):**
  * **`routes.py`**: Exposes FastAPI endpoints mapping to RAG services (e.g., `POST /rag/index-grant`, `POST /rag/search`).
  * **`pinecone_client.py`**: Wraps the Pinecone SDK, managing index initialization, dimensions (e.g. 768 or 1536), and batch upsertions.
  * **`indexer.py`**: Converts raw JSON Grant items into dense embedding vectors using an Embedding Model (e.g., OpenAI or HuggingFace) before passing them to the pinecone client.
  * **`document_builder.py`**: Constructs the unified context strings. (e.g., merging "Title + Description + Eligibility" into a single string to optimize the LLM's spatial understanding).
  * **`filters.py`**: Parses exact-match user parameters (Country, Institution Type) into query metadata that Pinecone natively understands for pre-filtering.
  * **`query_expander.py`**: Uses an LLM to take a simple user query ("Cancer research") and semantically expand it ("Oncology, tumors, metastasis, clinical trials") before hitting the Vector DB.
  * **`llm_judge.py`**: A secondary reranking step. Post-retrieval, an LLM evaluates the fetched documents strictly against the user's profile and query to score and filter false-positives.
  * **`profile_builder.py`**: Converts the Researcher's profile attributes into vector embeddings to enable "For You" passive recommendations.
  * **`recommender.py`**: The orchestrator. Combines `query_expander`, `indexer`, and `llm_judge` into a single pipeline to return the final list of grants to the user.
  * **`schemas.py`**: Pydantic models enforcing strict JSON validation at the boundaries.
  * **`springboot_client.py`**: Utility for Python to ping Java endpoints (closing the microservice loop).

### B. Core Backend (`/CoreBackend`) - Java + Spring Boot
**Core Responsibility:** The system of record. Manages secure user sessions (JWT), stores authoritative transactional data in PostgreSQL, and acts as the broker between the Frontend and the Python AI service.

* **Configuration & Setup:**
  * **`pom.xml` / `mvnw`**: Maven build scripts managing dependencies (Spring Web, Spring Security, Spring Data JPA, Postgres Driver).
  * **`src/main/resources/application.properties`**: Environment variables configuring Database URIs, Hibernate dialects, JWT Secrets, server port (`8080`), and AI Service URLs.

* **Domain Logic (`src/main/java/org/pramod/corebackend/`):**
  * **`service/GrantService.java`**: The core data manager. 
    * `saveOrUpdateGrant()`: Receives data from the Python scraper. Computes checksums on Grants. If new, saves to DB. If existing but modified (checksum mismatch), it updates. 
    * `triggerPineconeIndexing()`: Spawns an asynchronous `CompletableFuture` thread to ping the Python RAG service for vectorization.
  * **`service/AiServiceClient.java`**: The internal REST client. Configured specifically to inject the `X-API-KEY` into the HTTP Headers to bypass the Python FastAPI middleware lock.
  * ***(Standard MVC Layers)***:
    * **Controllers**: Map `GET/POST` requests from React.
    * **Repositories**: Spring Data JPA interfaces interacting directly with PostgreSQL.
    * **Entities**: Java classes annotated with `@Entity` representing DB schemas (Users, Grants, Profiles).
    * **Security Configuration**: Defines filter chains, CORS policies, and intercepts incoming requests to validate 'Bearer' JWTs.

### C. Frontend (`/frontend`) - React + TypeScript + Vite
**Core Responsibility:** The UI/UX presentation layer. Consumes back-end data, manages local UI state, and handles token lifecycles and navigation.

* **Build & Config:**
  * **`package.json` & `vite.config.ts`**: NPM scripts and Vite build rules.
  * **`tailwind.config.js`**: Utility styling framework setup.

* **React Core (`src/main.tsx` & `src/App.tsx`):**
  * Houses the React Router. Controls guarded routes.
  * Contains the global fallback logic to catch JWT authorization failures (throwing an alert and pushing the user to `/login`).

* **Services (`/src/services/`):**
  * **`apiClient.ts`**: The Axios instance. It tracks response payloads globally. Critically, it intercepts `401 Unauthorized` and `403 Forbidden` errors, parses the tokens, and attempts a background `/refresh` token request to keep sessions alive transparently.
  * **`authService.ts`**: Maps login, layout, and registration components directly to Java's auth controllers, extracting meaningful human-readable network errors payload objects.

* **Components (`/src/components/`):**
  * **`auth/`**: Registration and Login components. Implements state tracking for `isLoading` and `errorMsg`, offering real-time user feedback during authentication attempts.
  * **`profile/`**: User settings. Includes features like formatting monetary strings locally (e.g., converting to `INR`) and a custom Avatar uploader that reads files using a FileReader and saves the base64 encoded string to `localStorage`. Utilizes lazy state initialization (`useState(() => ...)`) to aggressively avoid React re-render penalties.
  * **`discovery/`**: The frontend consumer of the RAG pipeline. Passes user strings to the backend and renders structured, AI-evaluated grant cards.

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

## 4. Current State & Fixes Applied

*   **Security & RAG Sync:** The vulnerability where Java was unable to trigger Pinecone updates due to missing API keys has been fully resolved (`GrantService` refactored to use `AiServiceClient`).
*   **Token Refresh Integration:** `403` HTTP status handling added directly into the Vite interceptors. The pipeline is hardened against expired JWTs causing UI crashes.
*   **React Optimization & UI:** Avatar uploading successfully configured without looping effects, and INR metrics properly integrated into Researcher profiles.

## 5. Next Steps Preparedness
With the three layers communicating stably (Scraping → SQL persistence → AI Vector mapping → Secure UI fetching), you have a strong, highly defensive foundation to implement the next major modules securely.
