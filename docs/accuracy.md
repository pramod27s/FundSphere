# FundSphere RAG Accuracy Improvement Plan

Honest, prioritized improvements for the FundSphere AI grant-matching pipeline. Focused on what actually moves the needle — not generic RAG advice.

---

## The Real Bottleneck: You Can't Improve What You Can't Measure

Before tweaking weights or swapping embedders, build a **golden eval set**:

- Pick 30–50 real (researcher profile + query) pairs
- Hand-label the top 5 grants that *should* appear for each
- Build a script that runs the pipeline and reports: **Recall@10, MRR, NDCG@10**
- Run it after every change

Without this, every "improvement" is vibes-based. With it, you'll discover most of your tuning had near-zero effect and one obscure change moved Recall@10 by 12%.

---

## The Hidden Bug: Profile-Query Mashup

Currently concatenating `[bio + interests + keywords + userQuery]` into one embedding. This is **silently destroying accuracy** for two reasons:

1. **Profile drowns the query** — a 200-word bio + 5-word query means the embedding is 95% about who they are, 5% about what they want
2. **Stale profiles poison fresh intent** — if a researcher's profile says "machine learning" but today they're searching for "GIS flood mapping", the ML signal pulls results sideways

**Fix:** Run **two parallel retrievals** and fuse:
- Query-only embedding → captures *intent*
- Profile-only embedding → captures *fit*
- Fuse with RRF, give intent 1.5–2x weight

This single change usually beats HyDE.

---

## The Reranker is Where Real Accuracy Lives

`bge-reranker-v2-m3` is good but it's currently being fed `query + grant title + agency + chunk + fields + tags` — that's noisy. Rerankers are sensitive to input format.

Try:
- Format input as natural language: `"Researcher need: {query}. Grant offers: {title} from {agency}. Funds: {topic_chunk}. Eligible: {eligibility_chunk}."`
- Limit chunk to 200 tokens of the *most relevant* section, not whole document
- Test `bge-reranker-v2-gemma` or `cohere-rerank-v3` against your eval set

Reranker quality compounds — a 10% better reranker gives you 10% better results regardless of retrieval quality.

---

## Eligibility Scoring is Your Biggest Differentiator

Most RAG systems don't have hard constraints like grants do. The 25% eligibility weight is the **right idea but the implementation is fragile**:

- Build a **canonical eligibility ontology** (country aliases, applicant type taxonomy, institution hierarchies)
- For "career stage" — store as **range** not category (e.g. "post-PhD years: 2–7" instead of "early career")
- For "research field" — use embedding similarity on field tags, not Jaccard on raw strings ("AI" and "machine learning" share zero tokens but are the same field)

---

## The Sneaky Killer: Query Type Detection

Researchers ask in two very different modes:

- **Exploratory:** *"What's available for climate research?"* → wants breadth, novelty, diverse agencies
- **Specific:** *"NIH R01 for cancer immunotherapy, $500k+"* → wants precision, exact matches

Same scoring weights for both is wrong. Detect the mode (LLM call or simple rules) and switch weight profiles:

| Mode        | Semantic | Eligibility | Keyword | Diversity Penalty            |
|-------------|----------|-------------|---------|------------------------------|
| Exploratory | 0.30     | 0.20        | 0.15    | High (deduplicate by agency) |
| Specific    | 0.40     | 0.30        | 0.25    | None                         |

---

## Stop Tuning, Start Logging

Add structured logging at every stage:
- What was retrieved by semantic vs keyword
- What got eliminated by reranker
- What scored what at each signal
- What the user clicked / saved / ignored

**In 2 weeks of real usage you'll have more signal than 6 months of tuning.** Then train a tiny LightGBM model on (query features, grant features) → click — that beats hand-tuned weights every time.

---

## Other Solid Wins (from the prior pass)

### HyDE — Hypothetical Document Embedding
Instead of embedding the user's query directly, ask the LLM to **generate a fake ideal grant** for their project, then embed that. Grant docs and queries live in different semantic spaces — a hypothetical grant doc is much closer to real grants in embedding space than a user query is.

Use this only **after** the profile/query split is in place; otherwise gains will be muddied.

### Alpha Tuning for Hybrid Search
Current: `alpha = 0.3 → 0.75` (length-adaptive), default `0.7`.
Grant titles/agencies are exact-match terms (NSF, NIH, USDA) → sparse signal is strong here. Try **default `0.55`** and measure on the eval set.

### Profile Completeness Gate
A sparse or generic profile silently kills accuracy. Compute a profile-completeness score; if too low, prompt the user to fill more in *or* down-weight the profile portion of the query.

### Grant Section Chunking
If grants are chunked as full documents, eligibility info gets buried. Better:
- Chunk grants into typed sections: `title+agency`, `description`, `eligibility`, `deadline+funding`
- Store section type as metadata
- Weight eligibility chunks higher during reranking

---

## Execution Order

| # | Change                                  | Effort    | Impact            |
|---|-----------------------------------------|-----------|-------------------|
| 1 | Eval set + Recall@10 script             | Low       | Foundational      |
| 2 | Split profile/query embedding           | Low       | Very High         |
| 3 | Query-mode detection + dynamic weights  | Medium    | High              |
| 4 | Click/save logging                      | Medium    | Very High (compounds) |
| 5 | Reranker input formatting               | Low       | Medium-High       |
| 6 | Eligibility ontology + field embeddings | Medium    | High              |
| 7 | HyDE                                    | Low       | Medium-High       |
| 8 | Alpha retuning (0.55)                   | Very Low  | Medium            |
| 9 | Profile completeness gate               | Low       | Medium            |
| 10 | Section-typed chunking                 | High      | High              |
| 11 | Learned reranker (LightGBM on clicks)  | Medium    | Very High (after #4 has data) |

---

## Roadmap

- **Week 1:** Build eval set + Recall@10 script. Measure current baseline.
- **Week 2:** Split profile/query embedding. Re-measure.
- **Week 3:** Implement query-mode detection + dynamic weights.
- **Week 4:** Wire up click/save logging.
- **Month 2:** HyDE, reranker formatting, eligibility ontology — measure each in isolation.
- **Month 3+:** Train learned reranker on click data once enough signal exists.

**Rule:** Don't ship a change without an eval-set delta to back it up.
