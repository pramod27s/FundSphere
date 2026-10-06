"""Fetch a call's guidelines from a pasted link.

The link can point straight at a PDF, or at a web page. For a web page we
look for a linked guidelines PDF (most Indian agencies publish the real
rules as a PDF next to a short HTML notice) and use it if found; otherwise
we use the page's own text.

The URL comes from the user, so before every request (including each
redirect) the host is resolved and private, loopback and link-local
addresses are refused. Otherwise anyone could make this service fetch
internal endpoints such as the backend on localhost.
"""
from __future__ import annotations

import ipaddress
import logging
import re
import socket
from dataclasses import dataclass, field
from typing import List, Optional, Tuple
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

from proposal.pdf_extractor import extract_pages

logger = logging.getLogger("workspace.source_fetch")

MAX_BYTES = 25 * 1024 * 1024
TIMEOUT_SECONDS = 20
MAX_REDIRECTS = 5
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}
# Link text or file names that suggest the call's rules document.
_GUIDELINE_HINT = re.compile(
    r"guideline|instruction|call.for|advertisement|brochure|notification|scheme.document|how.to.apply",
    re.IGNORECASE,
)


class SourceFetchError(Exception):
    """The link could not be used; the message is safe to show the user."""


@dataclass
class FetchedSource:
    kind: str                      # "pdf" or "web"
    name: str                      # the URL the text actually came from
    pages: List[str]
    warnings: List[str] = field(default_factory=list)


def fetch_source(url: str) -> FetchedSource:
    url = (url or "").strip()
    if not url:
        raise SourceFetchError("Paste a link to the call or its guidelines.")
    if not re.match(r"^https?://", url, re.IGNORECASE):
        url = "https://" + url

    final_url, content_type, body = _get(url)

    if _is_pdf(content_type, body):
        return FetchedSource(kind="pdf", name=final_url, pages=extract_pages(body))

    html = body.decode(_charset(content_type), errors="replace")
    soup = BeautifulSoup(html, "html.parser")

    pdf_url = _find_guidelines_pdf(soup, final_url)
    if pdf_url:
        try:
            pdf_final, pdf_type, pdf_body = _get(pdf_url)
            if _is_pdf(pdf_type, pdf_body):
                pages = extract_pages(pdf_body)
                if sum(len(p.strip()) for p in pages) > 0:
                    return FetchedSource(
                        kind="pdf",
                        name=pdf_final,
                        pages=pages,
                        warnings=[f"Used the guidelines PDF linked from the page: {pdf_final}"],
                    )
        except SourceFetchError as exc:
            logger.info("Linked guidelines PDF %s not usable: %s", pdf_url, exc)

    for tag in soup(["script", "style", "noscript", "nav", "footer", "header", "form"]):
        tag.decompose()
    text = re.sub(r"\n\s*\n+", "\n\n", soup.get_text("\n")).strip()
    return FetchedSource(
        kind="web",
        name=final_url,
        pages=[text],
        warnings=[
            "Read from a web page, so items have no page numbers. "
            "If the agency publishes a guidelines PDF, upload it for a more complete checklist."
        ],
    )


def _get(url: str) -> Tuple[str, str, bytes]:
    """GET with manual redirects so every hop is checked. Returns (final_url, content_type, body)."""
    current = url
    for _ in range(MAX_REDIRECTS + 1):
        _check_public_host(current)
        try:
            response = requests.get(
                current,
                headers=_HEADERS,
                timeout=TIMEOUT_SECONDS,
                allow_redirects=False,
                stream=True,
            )
        except requests.RequestException as exc:
            raise SourceFetchError(
                "Couldn't open that link. Check it opens in your browser, or upload the guidelines PDF instead."
            ) from exc

        if response.is_redirect or response.status_code in (301, 302, 303, 307, 308):
            location = response.headers.get("Location")
            response.close()
            if not location:
                break
            current = urljoin(current, location)
            continue

        if response.status_code >= 400:
            response.close()
            raise SourceFetchError(
                f"The site returned an error ({response.status_code}). "
                "Upload the guidelines PDF instead."
            )

        body = _read_capped(response)
        return current, response.headers.get("Content-Type", ""), body

    raise SourceFetchError("That link redirects too many times. Upload the guidelines PDF instead.")


def _read_capped(response: requests.Response) -> bytes:
    chunks, total = [], 0
    try:
        for chunk in response.iter_content(chunk_size=64 * 1024):
            total += len(chunk)
            if total > MAX_BYTES:
                raise SourceFetchError("The linked file is larger than 25 MB.")
            chunks.append(chunk)
    except requests.RequestException as exc:
        raise SourceFetchError("The download was interrupted. Try again or upload the PDF.") from exc
    finally:
        response.close()
    return b"".join(chunks)


def _check_public_host(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise SourceFetchError("Only http and https links are supported.")
    try:
        infos = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80))
    except socket.gaierror as exc:
        raise SourceFetchError(f"Couldn't find the site {parsed.hostname}. Check the link.") from exc
    for info in infos:
        address = ipaddress.ip_address(info[4][0])
        if not address.is_global:
            raise SourceFetchError("That link points to a private or local address, which isn't allowed.")


def _is_pdf(content_type: str, body: bytes) -> bool:
    return "pdf" in (content_type or "").lower() or body[:5] == b"%PDF-"


def _charset(content_type: str) -> str:
    match = re.search(r"charset=([\w-]+)", content_type or "", re.IGNORECASE)
    return match.group(1) if match else "utf-8"


def _find_guidelines_pdf(soup: BeautifulSoup, base_url: str) -> Optional[str]:
    """First linked PDF whose link text or file name looks like the call's rules."""
    for anchor in soup.find_all("a", href=True):
        href = anchor["href"].strip()
        if ".pdf" not in href.lower():
            continue
        label = f"{anchor.get_text(' ', strip=True)} {href}"
        if _GUIDELINE_HINT.search(label):
            return urljoin(base_url, href)
    return None
