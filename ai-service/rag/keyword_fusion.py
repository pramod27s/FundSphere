from typing import Dict, List
from .schemas import KeywordCandidate, SemanticHit


def _normalize_score_map(score_map: Dict[int, float]) -> Dict[int, float]:
    if not score_map:
        return {}

    values = list(score_map.values())
    min_v = min(values)
    max_v = max(values)

    if max_v == min_v:
        return {k: 1.0 for k in score_map}

    return {k: (v - min_v) / (max_v - min_v) for k, v in score_map.items()}


def _rank_map(score_map: Dict[int, float]) -> Dict[int, int]:
    sorted_items = sorted(score_map.items(), key=lambda x: x[1], reverse=True)
    return {grant_id: rank + 1 for rank, (grant_id, _) in enumerate(sorted_items)}


def _rrf(rank1: int | None, rank2: int | None, k: int = 60) -> float:
    score = 0.0
    if rank1 is not None:
        score += 1.0 / (k + rank1)
    if rank2 is not None:
        score += 1.0 / (k + rank2)
    return score


def fuse_keyword_and_semantic(
    keyword_candidates: List[KeywordCandidate],
    semantic_hits: List[SemanticHit],
) -> Dict[int, dict]:
    keyword_raw = {item.grantId: float(item.keywordScore) for item in keyword_candidates}
    semantic_raw = {item.grantId: float(item.semanticScore) for item in semantic_hits}

    keyword_norm = _normalize_score_map(keyword_raw)
    semantic_norm = _normalize_score_map(semantic_raw)

    keyword_rank = _rank_map(keyword_raw)
    semantic_rank = _rank_map(semantic_raw)

    grant_ids = set(keyword_raw.keys()) | set(semantic_raw.keys())
    fused: Dict[int, dict] = {}

    for grant_id in grant_ids:
        fused[grant_id] = {
            "keywordScore": keyword_norm.get(grant_id, 0.0),
            "semanticScore": semantic_norm.get(grant_id, 0.0),
            "rrfScore": _rrf(keyword_rank.get(grant_id), semantic_rank.get(grant_id)),
            "rawKeywordScore": keyword_raw.get(grant_id, 0.0),
            "rawSemanticScore": semantic_raw.get(grant_id, 0.0),
        }

    return fused