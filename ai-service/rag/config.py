import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


@dataclass
class Settings:
    require_internal_api_key: bool = _as_bool(os.getenv("REQUIRE_INTERNAL_API_KEY"), True)
    internal_api_key: str = os.getenv("INTERNAL_API_KEY", os.getenv("SPRING_BOOT_API_KEY", ""))

    spring_boot_base_url: str = os.getenv("SPRING_BOOT_BASE_URL", "http://localhost:8080")
    spring_boot_api_key: str = os.getenv("SPRING_BOOT_API_KEY", "")
    spring_boot_timeout_seconds: float = float(os.getenv("SPRING_BOOT_TIMEOUT_SECONDS", "20"))
    spring_boot_retry_count: int = int(os.getenv("SPRING_BOOT_RETRY_COUNT", "2"))
    spring_boot_retry_backoff_seconds: float = float(os.getenv("SPRING_BOOT_RETRY_BACKOFF_SECONDS", "0.5"))

    pinecone_api_key: str = os.getenv("PINECONE_API_KEY", "")
    pinecone_index_host: str = os.getenv("PINECONE_INDEX_HOST", "")
    pinecone_namespace: str = os.getenv("PINECONE_NAMESPACE", "grants")
    pinecone_rerank_model: str = os.getenv("PINECONE_RERANK_MODEL", "bge-reranker-v2-m3")

    # Retrieval sizing
    semantic_top_k: int = int(os.getenv("SEMANTIC_TOP_K", "50"))
    keyword_top_k: int = int(os.getenv("KEYWORD_TOP_K", "50"))
    rrf_pool_size: int = int(os.getenv("RRF_POOL_SIZE", "30"))
    rerank_top_k: int = int(os.getenv("RERANK_TOP_K", "15"))
    final_top_k: int = int(os.getenv("FINAL_TOP_K", "10"))
    rrf_k: int = int(os.getenv("RRF_K", "60"))

    use_rerank: bool = _as_bool(os.getenv("USE_RERANK"), True)
    use_soft_filters: bool = _as_bool(os.getenv("USE_SOFT_FILTERS"), True)
    use_keyword_channel: bool = _as_bool(os.getenv("USE_KEYWORD_CHANNEL"), True)

    # Query Expansion Settings
    groq_api_key_query_expansion: str = os.getenv("GROQ_API_KEY_QUERY_EXPANSION", "")
    query_expansion_model: str = os.getenv("QUERY_EXPANSION_MODEL", "openai/gpt-oss-120b")
    enable_query_expansion: bool = _as_bool(os.getenv("ENABLE_QUERY_EXPANSION"), True)

    # Chunking Settings
    chunk_max_tokens: int = int(os.getenv("CHUNK_MAX_TOKENS", "400"))
    chunk_overlap_tokens: int = int(os.getenv("CHUNK_OVERLAP_TOKENS", "80"))
    enable_chunking: bool = _as_bool(os.getenv("ENABLE_CHUNKING"), True)

    # LLM Judge Settings — judge is now EXPLAIN-ONLY, never filters
    groq_api_key_llm_judge: str = os.getenv("GROQ_API_KEY_LLM_JUDGE", "")
    enable_llm_judge: bool = _as_bool(os.getenv("ENABLE_LLM_JUDGE"), True)
    llm_judge_model: str = os.getenv("LLM_JUDGE_MODEL", "openai/gpt-oss-120b")
    llm_judge_candidate_count: int = int(os.getenv("LLM_JUDGE_CANDIDATE_COUNT", "10"))

    # 5-signal Scoring Weights (sum = 1.00)
    weight_semantic: float = float(os.getenv("WEIGHT_SEMANTIC", "0.35"))
    weight_eligibility: float = float(os.getenv("WEIGHT_ELIGIBILITY", "0.25"))
    weight_keyword: float = float(os.getenv("WEIGHT_KEYWORD", "0.15"))
    weight_funding: float = float(os.getenv("WEIGHT_FUNDING", "0.15"))
    weight_freshness: float = float(os.getenv("WEIGHT_FRESHNESS", "0.10"))
    expired_penalty: float = float(os.getenv("EXPIRED_PENALTY", "0.30"))


settings = Settings()
