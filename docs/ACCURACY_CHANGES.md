# Accuracy Improvements — First Round

This is the first round of changes to improve recommender accuracy. **Everything
here is opt-in via env vars** — your current production behavior is unchanged
until you flip a flag.

## What was added

### 1. Profile / Query split retrieval (the big one)

**Problem:** Today, profile + user query are concatenated into one big string
and embedded as one vector. A 200-word bio drowns out a 5-word query — the
embedding ends up 95% about *who* the user is, not *what* they want right now.

**Fix:** Two parallel Pinecone retrievals — one anchored on the live query
("intent"), one anchored on the profile ("fit") — then weighted-RRF fused.
Intent gets a 2.0× weight by default so the live query dominates without
losing profile context entirely.

**Files touched:**
- [rag/profile_builder.py](rag/profile_builder.py) — new `build_profile_only_text` and `build_query_only_text` helpers
- [rag/recommender.py](rag/recommender.py) — new `_semantic_channel_split`, `_run_semantic_queries`, `_weighted_rrf_semantic`
- [rag/config.py](rag/config.py) — new `enable_profile_query_split`, `profile_query_split_intent_weight`

**To enable:**
```powershell
$env:ENABLE_PROFILE_QUERY_SPLIT="true"
$env:PROFILE_QUERY_SPLIT_INTENT_WEIGHT="2.0"   # tweak 1.0–3.0
```

**Behaviour notes:**
- When the user query is empty (e.g. "browse mode"), the split falls back to
  the original single-channel retrieval automatically.
- LLM query expansion is folded into the **intent channel** when enabled, so
  you don't lose its effect.
- Each Pinecone retrieval still applies the soft-filter recall fallback.

### 2. Structured reranker prompt

**Problem:** The reranker (bge-reranker-v2-m3) was being fed a `key: value`
dump of metadata. Cross-encoders are trained on natural language — they
underperform on structured data.

**Fix:** New formatter writes a clean natural-language description per
candidate, caps the chunk text at ~200 tokens so the most relevant content
isn't drowned by metadata, and feeds the **live user query** (not the merged
profile+query string) as the rerank anchor.

**Files touched:**
- [rag/recommender.py](rag/recommender.py) — new `_candidate_text_structured`, plus rerank query selection
- [rag/config.py](rag/config.py) — new `enable_structured_rerank_prompt`

**To enable:**
```powershell
$env:ENABLE_STRUCTURED_RERANK_PROMPT="true"
```

### 3. HyDE — Hypothetical Document Embedding (uses the new Groq key)

**Problem:** User queries and grant documents live in different vocabularies.
A researcher writes *"GIS for flood mapping in rural areas"* but a real grant
calls itself *"Geospatial Information Systems Capacity Building for Disaster
Risk Reduction in Underserved Communities"*. Their embeddings are far apart
in vector space → poor recall.

**Fix:** Before retrieval, ask the LLM (`openai/gpt-oss-120b` on Groq) to
write a short hypothetical grant announcement that would perfectly match the
user's need. Embed that instead of (or in addition to) the raw query. The
hypothetical doc lives in the same semantic space as real grants → much
better retrieval.

**Files added/touched:**
- [rag/hyde.py](rag/hyde.py) — new module: prompt, LLM call, in-memory LRU cache
- [rag/recommender.py](rag/recommender.py) — `_inject_hyde` helper; HyDE is generated
  once per request and threaded into both the standard channel and the split
  channel's intent path
- [rag/config.py](rag/config.py) — new `enable_hyde`, `groq_api_key_hyde`, `hyde_model`,
  `hyde_temperature`, `hyde_replace_query` settings

**To enable:**
```powershell
# In e:\FundSphere\ai-service\.env (or as PowerShell env vars):
ENABLE_HYDE=true
GROQ_API_KEY_HYDE=<your new Groq key>
HYDE_MODEL=openai/gpt-oss-120b
HYDE_TEMPERATURE=0.4
HYDE_REPLACE_QUERY=false   # false = HyDE rides alongside raw query (safer)
```

`GROQ_API_KEY_HYDE` falls back to `GROQ_API_KEY_QUERY_EXPANSION` and then to
`GROQ_API_KEY_LLM_JUDGE` if not set, so existing setups keep working.

**Behaviour notes:**
- LRU-cached (size 512) per `(api_key, model, prompt, temperature)`. Same
  query from the same user → zero extra LLM calls.
- Fails open: if Groq is down or returns garbage, the recommender silently
  falls back to the raw query — no broken responses.
- Tracks ~+200–600 ms latency on the *first* request per unique query;
  subsequent ones are cache hits (microseconds).

### 4. Eval harness

**Problem:** No way to measure if any change actually helps.

**Fix:** Lightweight runner at [eval/run_eval.py](eval/run_eval.py) that
imports the recommender directly, runs hand-labelled cases, and reports
Recall@K, MRR, latency.

**Files added:**
- `eval/testset.json` — 3 placeholder cases. Replace `expectedGrantIds` with
  real ones from your index.
- `eval/run_eval.py` — the runner.
- `eval/README.md` — how to label cases and interpret results.

## How to roll this out

1. **Label the eval set first.** Open `eval/testset.json`, fill in real
   `expectedGrantIds` for at least 5–10 cases. Without labels, the runner
   can't tell you if anything improved.

2. **Baseline the current system:**
   ```powershell
   cd e:\FundSphere\ai-service
   python -m eval.run_eval --csv eval_baseline.csv
   ```

3. **Turn on the split + structured rerank, re-run:**
   ```powershell
   $env:ENABLE_PROFILE_QUERY_SPLIT="true"
   $env:ENABLE_STRUCTURED_RERANK_PROMPT="true"
   python -m eval.run_eval --csv eval_split.csv
   ```

4. **Compare.** If Recall@10 / MRR improved without latency exploding, ship it
   by setting those env vars in your `.env` permanently. If it regressed,
   leave the flags off and the code stays dormant — no rollback needed.

## What's NOT in this round (but on deck)

These need design decisions or new infra and were intentionally deferred:

- **Query-mode detection** (exploratory vs. specific weight profiles) — needs
  weight-table sign-off.
- **Click / save logging** — needs a new Postgres table + frontend events.
- **Eligibility ontology rewrite** — needs domain review of alias dictionaries.
- **Section-typed grant chunking** — requires re-indexing all grants.

See `accuracy.md` at the repo root for the full backlog.

## Risk

- **All flags default OFF.** Without setting env vars, runtime behavior is
  identical to before this commit.
- The split retrieval makes **2 Pinecone calls** instead of 1 (in addition to
  the per-expansion-query calls). Expect roughly +30–50% latency on the
  semantic stage when enabled. Measure it with the eval runner.
- Structured rerank prompt is text-only — no extra API calls, no extra latency.

## Files changed

| File | Change |
|------|--------|
| `rag/config.py` | +8 settings (3 split/rerank + 5 HyDE) |
| `rag/profile_builder.py` | +2 helpers |
| `rag/recommender.py` | +4 methods, modified `recommend()` semantic + rerank stages, HyDE injection |
| `rag/hyde.py` | **new** — LLM hypothetical-grant generator with LRU cache |
| `eval/testset.json` | new |
| `eval/run_eval.py` | new |
| `eval/README.md` | new |
| `ACCURACY_CHANGES.md` | this file |
