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


    semantic_top_k: int = int(os.getenv("SEMANTIC_TOP_K", "30"))
    final_top_k: int = int(os.getenv("FINAL_TOP_K", "10"))
    use_rerank: bool = _as_bool(os.getenv("USE_RERANK"), True)

    # Query Expansion Settings
    gemini_api_key_query_expansion: str = os.getenv("GEMINI_API_KEY_QUERY_EXPANSION", "AIzaSyDBa-DGiRJJcmqIzPwpBc7hz1-dfwQG24o")
    query_expansion_model: str = os.getenv("QUERY_EXPANSION_MODEL", "gemini-2.0-flash")
    enable_query_expansion: bool = _as_bool(os.getenv("ENABLE_QUERY_EXPANSION"), True)

    # Chunking Settings
    chunk_max_tokens: int = int(os.getenv("CHUNK_MAX_TOKENS", "400"))
    chunk_overlap_tokens: int = int(os.getenv("CHUNK_OVERLAP_TOKENS", "80"))
    enable_chunking: bool = _as_bool(os.getenv("ENABLE_CHUNKING"), True)

    # LLM Judge Settings
    gemini_api_key_llm_judge: str = os.getenv("GEMINI_API_KEY_LLM_JUDGE", "AIzaSyDUqUXVn9o8ZRo9_zDAusdHGYg124ZlZl4")
    enable_llm_judge: bool = _as_bool(os.getenv("ENABLE_LLM_JUDGE"), True)
    llm_judge_model: str = os.getenv("LLM_JUDGE_MODEL", "gemini-2.0-flash")
    llm_judge_candidate_count: int = int(os.getenv("LLM_JUDGE_CANDIDATE_COUNT", "20"))

    # Scoring Weights
    weight_semantic: float = float(os.getenv("WEIGHT_SEMANTIC", "0.70"))
    weight_eligibility: float = float(os.getenv("WEIGHT_ELIGIBILITY", "0.20"))
    weight_freshness: float = float(os.getenv("WEIGHT_FRESHNESS", "0.10"))
    expired_penalty: float = float(os.getenv("EXPIRED_PENALTY", "0.15"))
    freshness_decay_rate: float = float(os.getenv("FRESHNESS_DECAY_RATE", "0.012"))


settings = Settings()