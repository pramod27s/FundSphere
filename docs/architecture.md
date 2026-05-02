# FundSphere RAG Architecture — Current State

Full pipeline as it stands after the accuracy round. Things in **bold** are new in this round; everything else was there already.

---

## Request Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│  FRONTEND (React)                                                        │
│  User clicks "AI Match" with a query → POST /api/researchers/me/matches  │
└──────────────────────────┬───────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  COREBACKEND (Spring Boot, Java)                                         │
│  • Resolves researcher from JWT                                          │
│  • Loads profile + maps to AiUserProfileResponse                         │
│  • Pre-filters grants via PostgreSQL FTS (top 3×K candidates)            │
│  • Forwards to ai-service POST /rag/recommend                            │
└──────────────────────────┬───────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  AI SERVICE (Python FastAPI)                                             │
│                                                                          │
│  ┌─ STAGE 1 · Build queries ───────────────────────────────────────────┐ │
│  │  • build_user_query_text(profile, userQuery)  [legacy concat]      │ │
│  │  • LLM query expansion → 3 variants  [Groq · gpt-oss-120b]         │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─ STAGE 1.5 · HyDE  ★ NEW ──────────────────────────────────────────┐ │
│  │  LLM writes a hypothetical grant announcement matching the user's │ │
│  │  need.  [Groq · gpt-oss-120b · LRU cached, fails open]            │ │
│  │  → Hypothetical doc lives in same vector space as real grants     │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─ STAGE 2 · Parallel retrieval ──────────────────────────────────────┐ │
│  │                                                                    │ │
│  │  ┌─ SEMANTIC CHANNEL ────────────────────────────────────────────┐ │ │
│  │  │  if ENABLE_PROFILE_QUERY_SPLIT:  ★ NEW                       │ │ │
│  │  │     ┌─ A · INTENT (live query)  ─────────┐                   │ │ │
│  │  │     │   • HyDE doc (if generated)        │ → Pinecone hybrid │ │ │
│  │  │     │   • Expanded query variants        │   (dense+sparse,  │ │ │
│  │  │     │   • Lightly grounded user query    │    α=0.3–0.75)    │ │ │
│  │  │     └────────────────────────────────────┘                   │ │ │
│  │  │     ┌─ B · FIT (profile-only) ──────────┐                    │ │ │
│  │  │     │   • Bio + interests + keywords    │ → Pinecone hybrid  │ │ │
│  │  │     └───────────────────────────────────┘                    │ │ │
│  │  │     → weighted-RRF fuse  (intent ×2.0, fit ×1.0)             │ │ │
│  │  │  else:                                                       │ │ │
│  │  │     single embedded query → Pinecone hybrid                  │ │ │
│  │  │                                                              │ │ │
│  │  │  Soft country filter applied; dropped if recall < 5          │ │ │
│  │  └──────────────────────────────────────────────────────────────┘ │ │
│  │                                                                    │ │
│  │  ┌─ KEYWORD CHANNEL ────────────────────────────────────────────┐  │ │
│  │  │  PostgreSQL FTS via Spring Boot                              │  │ │
│  │  │  Seeds: userQuery + profile.keywords + interests             │  │ │
│  │  └──────────────────────────────────────────────────────────────┘  │ │
│  │                                                                    │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─ STAGE 3 · Cross-channel RRF fusion ───────────────────────────────┐ │
│  │  score = Σ 1/(60 + rank_i)  · pool_size = 30                       │ │
│  │  Carries forward richest-metadata variant                          │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─ STAGE 4 · Rerank ─────────────────────────────────────────────────┐ │
│  │  Pinecone bge-reranker-v2-m3                                       │ │
│  │  if ENABLE_STRUCTURED_RERANK_PROMPT:  ★ NEW                       │ │
│  │     • Natural-language doc format ("Grant offered: ... Field:..." )│ │
│  │     • Chunk capped at ~200 tokens                                  │ │
│  │     • Anchor = live user query (not concatenated profile+query)    │ │
│  │  → top 15                                                          │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─ STAGE 5 · 5-signal weighted scoring ──────────────────────────────┐ │
│  │     0.35 × semantic       (rerank score, normalised)               │ │
│  │  +  0.25 × eligibility    (country/applicant/inst/field aliases)   │ │
│  │  +  0.15 × keyword_overlap (token overlap on grant text)           │ │
│  │  +  0.15 × funding_fit     (range overlap %)                       │ │
│  │  +  0.10 × freshness       (deadline + scrape age)                 │ │
│  │  −  0.30  (if deadline expired)                                    │ │
│  │  → top 10                                                          │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─ STAGE 6 · LLM explanations (annotative only) ─────────────────────┐ │
│  │  Groq · gpt-oss-120b — 1–2 sentence "why this grant" per result    │ │
│  │  Never reranks or filters                                          │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└──────────────────────────┬───────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  RESPONSE: top 10 grants + finalScore + per-signal breakdown + reason    │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## What's NEW in this round

| ★ | Feature | File |
|---|---|---|
| 1 | **HyDE — Hypothetical Document Embedding** | [ai-service/rag/hyde.py](ai-service/rag/hyde.py) |
| 2 | **Profile/Query split retrieval** with weighted RRF | [ai-service/rag/recommender.py](ai-service/rag/recommender.py) |
| 3 | **Structured reranker prompt** + live-query anchor | [ai-service/rag/recommender.py](ai-service/rag/recommender.py) |
| 4 | **Auto-eval pipeline** (sample → query-gen → judge → metrics) | [ai-service/eval/auto_eval.py](ai-service/eval/auto_eval.py) |
| 5 | **`/api/ai/users/sample-profiles`** endpoint | [CoreBackend/.../AiBridgeController.java](CoreBackend/src/main/java/org/pramod/corebackend/controller/AiBridgeController.java) |

All flag-gated, default OFF. Flip them in [ai-service/.env](ai-service/.env).

---

## Models in play

| Stage | Model | Provider |
|---|---|---|
| Dense embedding | `llama-text-embed-v2` (1024D) | Pinecone Inference |
| Sparse embedding | `pinecone-sparse-english-v0` (BM25) | Pinecone Inference |
| Reranker | `bge-reranker-v2-m3` | Pinecone Inference |
| Query expansion | `openai/gpt-oss-120b` | Groq |
| **HyDE** | `openai/gpt-oss-120b` | **Groq** (uses dedicated `GROQ_API_KEY_HYDE`) |
| LLM judge / explanations | `openai/gpt-oss-120b` | Groq |

---

## Feature flags (all in `ai-service/.env`)

```ini
ENABLE_HYDE=true                          # HyDE on/off
HYDE_MODEL=openai/gpt-oss-120b
HYDE_TEMPERATURE=0.4
HYDE_REPLACE_QUERY=false                  # false = HyDE rides alongside raw query

ENABLE_PROFILE_QUERY_SPLIT=true           # Split semantic channel
PROFILE_QUERY_SPLIT_INTENT_WEIGHT=2.0     # 1.0–3.0; how much intent dominates fit

ENABLE_STRUCTURED_RERANK_PROMPT=true      # Cleaner reranker input format

# Pre-existing flags
ENABLE_QUERY_EXPANSION=true
ENABLE_LLM_JUDGE=true
USE_RERANK=true
USE_KEYWORD_CHANNEL=true
USE_SOFT_FILTERS=true
```

---

## Performance envelope

| Stage | Latency | Cost |
|---|---|---|
| Query expansion | ~300ms | LLM tokens |
| HyDE (cold) | ~400ms | LLM tokens |
| HyDE (cached) | <1ms | $0 |
| Pinecone semantic (×2 if split) | ~150ms each | included |
| Reranker | ~200ms | included |
| LLM judge | ~600ms | LLM tokens |
| **Total p50** | **~1.2–1.6s** | ~$0.001/req |

Split retrieval adds one extra Pinecone call (~+150ms). HyDE adds one cold LLM call on first occurrence of a query, then ~free thanks to the LRU cache.

---

## Verification

Run the auto-eval to confirm the architecture actually delivers:

```powershell
cd e:\FundSphere\ai-service
python -m eval.auto_eval --n 15 --compare
```

You'll get a side-by-side diff of baseline (all flags off) vs improved (all flags on) on Recall@10, MRR, NDCG@10, and latency. That's the only test that matters.

---

## Backlog (deferred — see [accuracy.md](accuracy.md))

- Click / save event logging → learned reranker
- Query-mode detection (exploratory vs. specific weight profiles)
- Eligibility ontology rewrite (canonical aliases + field embeddings)
- Section-typed grant chunking (requires re-indexing)
- Profile completeness gate at the UI
