# Recommender eval

Measures how good the grant recommendations are, and whether a change makes
them better or worse.

```
eval/
  cases.json    the test users: 26 profiles + queries across the grant corpus
  labels.json   ratings: for each case, which grants are relevant (0–3)
  run.py        runs the cases, rates new results, prints the scores
```

## Run it

From `ai-service/`, with CoreBackend running:

```powershell
python -m eval.run                                   # score the current settings
python -m eval.run --compare ENABLE_HYDE=false       # current vs. one change
python -m eval.run --compare WEIGHT_SEMANTIC=0.6 WEIGHT_ELIGIBILITY=0.1
python -m eval.run --tune                            # find better scoring weights
```

`--compare` takes any `.env` setting name, so the same command tests a flag,
a weight or a pool size. `--tune` searches for better weights by itself (see
below). Other options: `--top-k` (default 10), `--depth` (results rated per
case, default 20) and `--save report.json`.

## What happens

1. Each case runs through the recommender: once with your current `.env`
   settings and, with `--compare`, once more with the changed values.
2. Any returned grant that `labels.json` has no rating for is rated 0–3 by an
   LLM (`LLM_JUDGE_MODEL`) and saved there. Ratings already in the file are
   never changed, so only new grants cost tokens.
3. Each config is scored against all of the case's ratings:

| Metric | Meaning |
|---|---|
| Recall@10 | share of the case's relevant grants (rating ≥ 2) that made the top 10 |
| MRR | 1 / rank of the first relevant grant (1.0 = it was first) |
| NDCG@10 | quality of the whole ranking, using the 0–3 grades (1.0 = ideal order) |

Because both configs are scored against the same ratings, a relevant grant
that one config found and the other missed counts against the one that
missed it.

Example output:

```
                                             current       variant
  Recall@10                                    62.0%         58.4%   (-3.6%)
  MRR                                          0.712         0.690   (-0.022)
  NDCG@10                                      0.655         0.631   (-0.024)
  Avg latency (s)                                5.1           3.9   (-1.2)
  Scored 24/26 cases
```

These numbers illustrate the format; they are not real results.

## Reading the numbers

- **Compare configs within one run.** Absolute numbers drift between runs as
  `labels.json` grows (more known relevant grants) and as grants expire.
- **With ~25 cases, a few points can be noise.** Look at the per-case lines
  printed below the summary: a change worth keeping wins on most cases.
- A case is left out when a returned grant couldn't be rated (re-run to
  retry) or when no relevant grant is known for it yet.

## Tuning the weights (--tune)

`--tune` looks for better values of the five `WEIGHT_*` settings
(semantic / eligibility / keyword / funding / freshness).

1. It runs the cases once and rates every grant the reranker picked. The
   weights only reorder those grants, so no more searching is needed.
2. It re-ranks them under 42 weight sets (yours plus a grid) and measures
   NDCG@10 for each. This takes seconds and costs no tokens.
3. **The overfitting check:** it picks the best set using half the cases,
   then measures it on the other half, and does the same the other way round.
4. It suggests the best set only if it beats your current weights by at least
   0.01 NDCG on the unseen half, **both times**. Otherwise it tells you to keep
   your weights: a set that only wins on the cases it was picked on is fitting
   noise, not making recommendations better.

```
Weight tuning: 42 weight sets on 24 cases, NDCG@10
  (weights are semantic/eligibility/keyword/funding/freshness)
  current  0.50/0.20/0.10/0.10/0.10   NDCG 0.655
  best     0.60/0.20/0.07/0.07/0.06   NDCG 0.681
  Gain on unseen cases (picked on one half, tested on the other): +0.018, +0.012

  -> The gain holds on cases the weights weren't picked on. Paste into ai-service/.env:
       WEIGHT_SEMANTIC=0.60
       ...
```

These numbers illustrate the format; they are not real results. Tuning needs
at least 6 scored cases.

## labels.json is the benchmark — commit it

```json
"national-postdoc-physics-in": {
  "412": {"rating": 3, "title": "National Post Doctoral Fellowship (N-PDF)",
          "deadline": null, "reason": "postdoc fellowship for fresh PhDs in India"}
}
```

- **Disagree with the LLM?** Change the `rating`. Your edit is kept.
- **Know a relevant grant the recommender never returns?** Add an entry for
  it with its grant id. It then counts as a miss until a config finds it.
- Ratings of grants whose `deadline` has passed are ignored, since the
  recommender no longer returns expired grants.

## Adding a case

Append to `cases.json` with a new unique `id`, a `profile` (same fields
CoreBackend sends) and a `query`. The next run rates its results.
