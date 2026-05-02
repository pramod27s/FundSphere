# RAG Eval

Two ways to measure recommender quality:

| Tool | When to use | Effort |
|---|---|---|
| **`auto_eval.py`** | Daily — automated, no labelling needed | 0 (just run it) |
| `run_eval.py` | When you want hand-labelled gold cases | High (manual labelling) |

---

## Quick start (recommended)

```powershell
cd e:\FundSphere\ai-service

# Single run with current settings
python -m eval.auto_eval --n 15

# Compare baseline (flags off) vs improved (HyDE + split + structured rerank)
python -m eval.auto_eval --n 15 --compare --save report.json
```

The script:
1. Pulls 15 random real researcher profiles from CoreBackend.
2. Asks the LLM to invent a realistic query each researcher might type.
3. Runs the recommender → top-K candidates per profile.
4. Asks the LLM to rate each candidate 0–3 for relevance.
5. Computes **Recall@K**, **MRR**, **NDCG@K**.
6. (`--compare`) re-runs with the new accuracy flags ON, diffs the two reports.

Cost: ~$0.05–$0.15 in Groq tokens per full run.

### Requirements

- CoreBackend running (the `/api/ai/users/sample-profiles` endpoint must be live).
  If it isn't, the script falls back to LLM-synthesised profiles automatically
  — pass `--synthetic-profiles` to force this.
- ai-service `.env` populated with at least one Groq key.
- Pinecone reachable.

### Sample output (compare mode)

```
┌─ Comparison ──────────────────────────────────────────────────────┐
│ BASELINE_OFF    → IMPROVED_ON     │ 15 cases · top_k=10
├───────────────────────────────────────────────────────────────────┤
│ Recall@10  :  41.32%  →  58.91%   (+17.59pp)
│ MRR        :  0.412   →  0.617    (+0.205)
│ NDCG@10    :  0.503   →  0.681    (+0.178)
│ Latency    :    784ms →   1190ms  (+406 ms)
└───────────────────────────────────────────────────────────────────┘
```

If improved metrics > baseline, ship the flags. Done.

---

## Manual `run_eval.py` (still available)

## Why

Without numbers, every "is this better?" question is a vibe check. With this,
you can compare two configs:

```
# Baseline
python -m eval.run_eval

# With the profile/query split turned on
$env:ENABLE_PROFILE_QUERY_SPLIT="true"; python -m eval.run_eval
```

The metrics that move (or don't) tell you whether the change was real.

## Setup

1. **Make sure the ai-service can run locally.** You need:
   - `.env` populated with `PINECONE_API_KEY`, `PINECONE_INDEX_HOST`,
     `GROQ_API_KEY_QUERY_EXPANSION`, `GROQ_API_KEY_LLM_JUDGE`,
     `SPRING_BOOT_BASE_URL`.
   - The Spring Boot backend running (the recommender calls it for the keyword
     channel). If you want to skip the keyword channel during eval, set
     `USE_KEYWORD_CHANNEL=false` in your shell.

2. **Label the test set.** Open `eval/testset.json` and for each case:
   - Tweak the `userQuery` and `userProfile` to match a realistic researcher.
   - Fill in `expectedGrantIds` with the **grant IDs you (the human) consider
     correct** for that query. 3–5 IDs per case is fine.

   To find grant IDs, query your Postgres `grants` table directly, or look at
   what your existing recommender returns and pick the ones a human would call
   correct.

3. **Run the eval.**

```powershell
cd e:\FundSphere\ai-service
python -m eval.run_eval
```

## How to compare configs

The runner prints all the relevant flags at the top of every run, so you
always know what produced a number. Save runs side by side:

```powershell
# Baseline → out_baseline.csv
python -m eval.run_eval --csv out_baseline.csv

# With profile/query split + structured rerank prompt
$env:ENABLE_PROFILE_QUERY_SPLIT="true"
$env:ENABLE_STRUCTURED_RERANK_PROMPT="true"
python -m eval.run_eval --csv out_split.csv
```

Diff the CSVs to see which cases improved, which regressed.

## Output

```
==============================================================================
FundSphere RAG eval
------------------------------------------------------------------------------
  testset                       : eval/testset.json
  cases                         : 3
  top_k                         : 10
  ENABLE_PROFILE_QUERY_SPLIT    : False
  …
==============================================================================
case_id                      expected    r@K    mrr first  lat(ms)
------------------------------------------------------------------------------
gis-flood-mapping                   3   66.7%  0.500    2     842
ai-drug-discovery                   3  100.0%  1.000    1     901
climate-rural-india                 3   33.3%  0.250    4     788
------------------------------------------------------------------------------
  Recall@10                        :  66.7%  (3 labelled cases)
  MRR                              : 0.583
  Avg latency                      : 844 ms
==============================================================================
```

## Adding more cases

Just append to the `cases` array in `testset.json`. Aim for **20–30 cases**
spanning different fields (AI, climate, social science, biomedical), career
stages, and countries — that's the minimum you need before the metrics stop
being noisy.

## Notes

- `expectedGrantIds: []` (empty) means the case runs but is excluded from the
  Recall/MRR averages. Useful for smoke-testing a query before labelling.
- The runner imports the recommender directly — no HTTP, no auth headers
  needed.
- LLM-judge explanations still run (controlled by `ENABLE_LLM_JUDGE`); turn
  them off during eval to save tokens: `$env:ENABLE_LLM_JUDGE="false"`.
