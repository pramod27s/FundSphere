"""The /rag routes log unexpected failures and reply without the exception text."""
from __future__ import annotations

import asyncio
import unittest
from unittest import mock

from fastapi import HTTPException

from rag import routes


class UnexpectedErrorTests(unittest.TestCase):
    def test_a_failure_is_logged_but_its_details_are_not_returned(self) -> None:
        failure = RuntimeError("connect to pinecone-internal.10.0.0.5 failed: key pc-abc123")
        with mock.patch.object(routes.indexer, "delete_grant", side_effect=failure), \
                self.assertLogs("rag.routes", level="ERROR") as logs:
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(routes.delete_grant(5))

        self.assertEqual(raised.exception.status_code, 500)
        self.assertEqual(raised.exception.detail, routes.UNEXPECTED_ERROR)
        self.assertNotIn("pinecone-internal", raised.exception.detail)
        # The full error, with its traceback, is in the service's log instead.
        self.assertIn("Removing grant 5 from the index failed", logs.output[0])
        self.assertIn("pc-abc123", logs.output[0])


if __name__ == "__main__":
    unittest.main()
