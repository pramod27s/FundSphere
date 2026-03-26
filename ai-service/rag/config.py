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
    spring_boot_base_url: str = os.getenv("SPRING_BOOT_BASE_URL", "http://localhost:8080")
    spring_boot_api_key: str = os.getenv("SPRING_BOOT_API_KEY", "")

    pinecone_api_key: str = os.getenv("PINECONE_API_KEY", "")
    pinecone_index_host: str = os.getenv("PINECONE_INDEX_HOST", "")
    pinecone_namespace: str = os.getenv("PINECONE_NAMESPACE", "grants")
    pinecone_rerank_model: str = os.getenv("PINECONE_RERANK_MODEL", "bge-reranker-v2-m3")

    semantic_top_k: int = int(os.getenv("SEMANTIC_TOP_K", "30"))
    final_top_k: int = int(os.getenv("FINAL_TOP_K", "10"))
    use_rerank: bool = _as_bool(os.getenv("USE_RERANK"), True)


settings = Settings()