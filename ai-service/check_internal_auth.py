from fastapi.testclient import TestClient

from main import app
from rag.config import settings


if __name__ == "__main__":
    client = TestClient(app)

    health = client.get("/health")
    no_key = client.post("/rag/index-grant", json={"grantId": 1})

    headers = {"X-API-KEY": settings.internal_api_key} if settings.internal_api_key else {}
    with_key = client.post("/rag/index-grant", json={"grantId": 1}, headers=headers)

    print("/health:", health.status_code)
    print("/rag/index-grant without key:", no_key.status_code)
    print("/rag/index-grant with key:", with_key.status_code)
    print("Note: with-key may be 500 if downstream CoreBackend/Pinecone is unavailable.")

