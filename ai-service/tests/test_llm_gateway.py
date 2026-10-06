"""Tests for llm.gateway: concurrency limit, usage tracking, fallbacks. No API calls."""
from __future__ import annotations

import asyncio
import threading
import time
import unittest
from unittest import mock

from llm import gateway


class GatewayTests(unittest.TestCase):
    def setUp(self):
        gateway._cooldown_until.clear()
        self.patches = [
            mock.patch.object(gateway, "_DEFAULT_MODEL", "primary"),
            mock.patch.object(gateway, "_FALLBACK_MODELS", ["backup"]),
            mock.patch.object(gateway, "_GROQ_API_KEY", None),
            mock.patch.object(gateway, "_BACKOFF_BASE_SECONDS", 0.0),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()

    def test_usage_is_tracked_across_parallel_tasks(self):
        def fake(prompt, *, model, temperature, max_output_tokens, thinking_budget):
            return '{"ok": true}', (100, 20, 5)

        async def run():
            with gateway.track_usage() as usage:
                await asyncio.gather(*[gateway.generate_json("p", task=f"t{i % 2}") for i in range(4)])
            return usage

        with mock.patch.object(gateway, "_generate_gemini_sync", side_effect=fake):
            usage = asyncio.run(run())
        summary = usage.summary()
        self.assertEqual(summary["calls"], 4)
        self.assertEqual(summary["input_tokens"], 400)
        self.assertEqual(summary["output_tokens"], 100)  # thinking counts as output
        self.assertEqual(summary["by_task"]["t0"]["calls"], 2)

    def test_concurrency_never_exceeds_limit(self):
        active, peak, lock = [0], [0], threading.Lock()

        def fake(prompt, **kwargs):
            with lock:
                active[0] += 1
                peak[0] = max(peak[0], active[0])
            time.sleep(0.05)
            with lock:
                active[0] -= 1
            return "{}", (1, 1, 0)

        async def run():
            await asyncio.gather(*[gateway.generate_json("p") for _ in range(10)])

        with mock.patch.object(gateway, "_generate_gemini_sync", side_effect=fake), \
                mock.patch.object(gateway, "_MAX_CONCURRENCY", 3):
            gateway._semaphores.clear()
            asyncio.run(run())
        self.assertLessEqual(peak[0], 3)
        self.assertGreaterEqual(peak[0], 2)

    def test_quota_error_switches_to_fallback_model_and_opens_breaker(self):
        used = []

        def fake(prompt, *, model, **kwargs):
            used.append(model)
            if model == "primary":
                raise RuntimeError("429 RESOURCE_EXHAUSTED retryDelay: '30s'")
            return '{"ok": 1}', (10, 5, 0)

        with mock.patch.object(gateway, "_generate_gemini_sync", side_effect=fake):
            self.assertEqual(asyncio.run(gateway.generate_json("p")), {"ok": 1})
            used.clear()
            asyncio.run(gateway.generate_json("p"))
        self.assertEqual(used, ["backup"])  # primary skipped while in cooldown

    def test_thinking_budget_is_passed_through(self):
        seen = {}

        def fake(prompt, *, model, temperature, max_output_tokens, thinking_budget):
            seen["thinking"] = thinking_budget
            return "{}", (1, 1, 0)

        with mock.patch.object(gateway, "_generate_gemini_sync", side_effect=fake):
            asyncio.run(gateway.generate_json("p", thinking_budget=0))
        self.assertEqual(seen["thinking"], 0)

    def test_everything_failing_raises_a_clear_error_and_counts_failures(self):
        def fake(prompt, **kwargs):
            raise RuntimeError("500 internal")

        async def run():
            with gateway.track_usage() as usage:
                with self.assertRaises(gateway.LLMUnavailableError):
                    await gateway.generate_json("p", retries=0)
            return usage

        with mock.patch.object(gateway, "_generate_gemini_sync", side_effect=fake):
            usage = asyncio.run(run())
        self.assertEqual(usage.failed_calls, 2)  # primary + backup
        self.assertEqual(usage.calls, [])

    def test_malformed_json_is_repaired_or_retried(self):
        replies = iter(['Here you go: {"a": 1,}', '{"a": 2}'])

        def fake(prompt, **kwargs):
            return next(replies), (1, 1, 0)

        with mock.patch.object(gateway, "_generate_gemini_sync", side_effect=fake):
            self.assertEqual(asyncio.run(gateway.generate_json("p")), {"a": 1})


if __name__ == "__main__":
    unittest.main()
