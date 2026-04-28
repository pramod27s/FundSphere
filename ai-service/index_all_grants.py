import sys
import os

# Add the parent directory so we can import rag module if needed
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from rag.springboot_client import SpringBootClient
from rag.pinecone_client import PineconeService
from rag.indexer import GrantIndexer

def main():
    print("Initializing clients...")
    spring = SpringBootClient()
    pinecone = PineconeService()
    indexer = GrantIndexer(spring, pinecone)

    print("Fetching grant IDs from CoreBackend...")
    try:
        # Since 1970 to get all of them
        grant_ids = spring.get_changed_grant_ids("1970-01-01T00:00:00Z")
        print(f"Found {len(grant_ids)} grants to index.")
    except Exception as e:
        print(f"Failed to fetch grant IDs: {e}")
        return

    if not grant_ids:
        print("No grants found in the database. Are there any grants in CoreBackend?")
        return

    print("Starting indexing process...")
    try:
        result = indexer.index_many(grant_ids)
        successful = [r for r in result.get('results', []) if r.get('status') == 'indexed']
        failed = [r for r in result.get('results', []) if r.get('status') == 'failed']

        print(f"Indexing complete! Successfully indexed: {len(successful)}, Failed: {len(failed)}")
        if failed:
            print("Failed Grants:")
            for f in failed:
                print(f"  Grant ID {f.get('grantId')}: {f.get('error')}")
    except Exception as e:
        print(f"Indexing failed with error: {e}")

if __name__ == '__main__':
    main()

