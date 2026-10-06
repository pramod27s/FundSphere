"""Check that each AI-extracted source quote really appears in the guidelines.

The LLM is asked to copy sentences verbatim, but it sometimes paraphrases,
merges two sentences or cites the wrong page. This module finds each quote
in the extracted page text so the UI can show which sources are verified.

Matching is word-level so it is fast on 30+ page documents and tolerant of
PDF extraction noise (hyphenation, line breaks, curly quotes, bullets):
  1. exact match of the normalised quote inside a normalised page;
  2. otherwise, around the longest run of the quote found on a page, the
     share of the quote's words that appear in order must reach the
     threshold. Looking only near that run stops common words scattered
     across a page from adding up to a false match.
The cited page is tried first, so a wrong page number is corrected rather
than the item being marked unverified.
"""
from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher
from typing import List, Optional, Sequence, Tuple

# Share of the quote's words that must be found, in order, near each other.
MATCH_THRESHOLD = 0.9
# Quotes shorter than this many words can match by accident, so they need
# an exact match.
MIN_FUZZY_WORDS = 5

_TRANSLATE = str.maketrans({
    "‘": "'", "’": "'", "“": '"', "”": '"',
    "–": "-", "—": "-", " ": " ", "•": " ",
})


def normalise(text: str) -> str:
    """Lowercase, unify quotes and dashes, and collapse whitespace and
    punctuation into single spaces (keeping %, ₹ and decimal points)."""
    text = unicodedata.normalize("NFKC", text or "").translate(_TRANSLATE).lower()
    text = re.sub(r"[^\w%₹.]+", " ", text)
    text = re.sub(r"(?<!\d)\.|\.(?!\d)", " ", text)  # drop full stops, keep "2.5"
    return re.sub(r"\s+", " ", text).strip()


class QuoteLocator:
    """Finds quotes in one document. Pages are normalised once, up front."""

    def __init__(self, pages: Sequence[str]):
        self._pages = [normalise(p) for p in pages]
        self._page_words = [p.split() for p in self._pages]

    def locate(self, quote: str, cited_page: Optional[int] = None) -> Tuple[bool, Optional[int]]:
        """Return (verified, page) for `quote`, where page 1 is the first page.

        `page` is the page the quote was found on, or `cited_page` unchanged
        when it wasn't found anywhere.
        """
        quote_words = normalise(quote).split()
        if not quote_words or not self._pages:
            return False, cited_page

        order: List[int] = []
        if cited_page is not None and 1 <= cited_page <= len(self._pages):
            order.append(cited_page)
        order.extend(p for p in range(1, len(self._pages) + 1) if p != cited_page)

        # Pass 1: exact match (cheap substring test on every page).
        joined = " ".join(quote_words)
        for page_no in order:
            if joined in self._pages[page_no - 1]:
                return True, page_no

        if len(quote_words) < MIN_FUZZY_WORDS:
            return False, cited_page

        # Pass 2: fuzzy match near the longest run of the quote on each page.
        best_page, best_score = None, 0.0
        for page_no in order:
            score = _window_score(quote_words, self._page_words[page_no - 1])
            if score > best_score:
                best_page, best_score = page_no, score
                if score >= 1.0:
                    break
        if best_score >= MATCH_THRESHOLD:
            return True, best_page
        return False, cited_page


def _window_score(quote_words: List[str], page_words: List[str]) -> float:
    if not page_words:
        return 0.0
    matcher = SequenceMatcher(None, page_words, quote_words, autojunk=False)
    longest = matcher.find_longest_match(0, len(page_words), 0, len(quote_words))
    if longest.size == 0:
        return 0.0
    # Window around the longest run, wide enough for the whole quote plus
    # some slack for words the PDF extraction split or inserted.
    n = len(quote_words)
    start = max(0, longest.a - longest.b - n // 4)
    end = min(len(page_words), longest.a + (n - longest.b) + n // 4)
    window = SequenceMatcher(None, page_words[start:end], quote_words, autojunk=False)
    matched = sum(block.size for block in window.get_matching_blocks())
    return matched / n


def locate_quote(
    quote: str,
    pages: Sequence[str],
    cited_page: Optional[int] = None,
) -> Tuple[bool, Optional[int]]:
    """One-off convenience wrapper around QuoteLocator."""
    return QuoteLocator(pages).locate(quote, cited_page)
