# 🌐 FundSphere

**FundSphere** is an intelligent, AI-driven grant discovery and matching platform. It bridges the gap between researchers, startups, and academic institutions and the complex landscape of global funding opportunities. By leveraging Modern web technologies, Large Language Models (LLMs), and Vector Search (RAG), FundSphere automates the labor-intensive process of finding and qualifying for grants.

---

## ✨ Key Features

1. **AI-Powered Grant Matching (RAG)**
   - Replaces keyword-only searches with deep semantic understanding of a user's research bio, interests, and constraints.
   - Generates an **"Explainable AI" Rational** for every match (e.g., *"Strong semantic overlap in climate tech and explicitly matches your PhD applicant profile"*).
   
2. **Hybrid Search Engine**
   - Implements **Reciprocal Rank Fusion (RRF)**.
   - Combines traditional relational keyword search (PostgreSQL) with semantic vector search (Pinecone).
   - Dynamically ranks results using custom modifiers (Freshness Score, Eligibility Score, Expired Penalties).

3. **Smart Ingestion Strategy ("Two-Pass Delta" Scraping)**
   - **Pass 1 (Free Monitor):** Fast, zero-cost hashing of target websites to detect layout or content deltas.
   - **Pass 2 (AI Extractor):** When changes are detected, a managed intelligent scraper (Firecrawl / Crawl4AI) is dispatched to rigidly extract unstructured web text into a structured, strict `GrantSchema` JSON.

4. **Rich Researcher Profiles**
   - Detailed user state tracking (Career stage, Institution type, Country, Min/Max funding preferences).
   - Fine-grained notification system for deadlines and weekly recommendations.

---

## 🏗️ Architecture & Tech Stack

FundSphere utilizes a highly decoupled, microservice-inspired architecture separated into three main pillars:

### 1. Frontend (User Experience)
- **Framework:** React 18 / Vite / TypeScript
- **Styling:** Tailwind CSS & Lucide Icons
- **Highlights:** Sleek dashboard, animated skeleton loaders, responsive "AI Match" scores, and granular profile management.

### 2. CoreBackend (Business Logic & Gateway)
- **Framework:** Java 17+ / Spring Boot
- **Database:** PostgreSQL
- **Highlights:** Secures endpoints with JWT, centralizes researcher profile data, and acts as the gatekeeper (`AiBridgeController`) hydrating user payloads before communicating with the Python AI layers.

### 3. AI-Service (Intelligence Layer)
- **Framework:** Python / FastAPI
- **Vector Database:** Pinecone
- **Scraping Engine:** Firecrawl API
- **Highlights:** Analyzes JSON profiles, retrieves embedded grants from Pinecone, merges lexical searches from Spring Boot, and performs dynamic mathematical reranking of candidates (`recommender.py`).

---

## ⚙️ How AI Match Works (Under the Hood)

When a user clicks **"AI Match"**:
1. **Hydration:** The frontend sends the user's custom query to `CoreBackend`.
2. **Context Assembly:** `CoreBackend` grabs the researcher's full profile (country, degree, keywords) from PostgreSQL and sends it to the `ai-service`.
3. **Retrieval:** The Python `ai-service` converts the profile and query into an embedding, and searches Pinecone (applying hard metadata filters like `country` and `applicantType` where possible).
4. **Scoring & Fusion:** Hits from Pinecone are combined with direct keyword matches. A final score is calculated using Semantic similarity (45%), Keyword match (25%), Eligibility (15%), and Deadline Freshness (10%).
5. **UI Rendering:** The results are shipped back to the frontend and rendered in beautiful UI cards detailing the Match Percentage and AI Reasoning.

---

## 🚀 The Scraping Pipeline

1. **Target Identification:** `smart_scheduler.py` runs on a chron-job.
2. **Delta Hash Check:** It calculates the SHA-256 hash of the raw `<main>` text of agency pages.
3. **LLM Extraction:** If the hash differs from the database, it asks Firecrawl to process the page using a strict system prompt to capture elements like `fundingAmountMax` or `eligibleCountries`.
4. **Data Sync:** Clean JSON is dumped and POSTed to the `CoreBackend`, where it gets persisted to PostgreSQL and simultaneously embedded into Pinecone for future RAG searches.

---

*Built with ❤️ to revolutionize how researchers fund the future.*
