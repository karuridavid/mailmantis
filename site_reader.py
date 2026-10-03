"""Fetch a business website's public pages and reduce them to plain text for the brief.

Gemini's own URL fetcher is often blocked by bot protection, so the server reads
the homepage (and an About page when one is linked) and hands Gemini the text.
"""
from __future__ import annotations

from html.parser import HTMLParser
import re
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

USER_AGENT = "Mozilla/5.0 (compatible; MailMantis/1.0; business brief reader)"
SKIP_TAGS = {"script", "style", "noscript", "svg", "template", "iframe", "head"}
ABOUT_PATH = re.compile(r"/(about|about-us|aboutus|who-we-are|our-story|our-company|company)(\.html?)?/?$", re.I)
MAX_BYTES = 600_000


class _Extractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.description = ""
        self.parts: list[str] = []
        self.links: list[str] = []
        self._skip = 0
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "title":
            self._in_title = True
        elif tag == "meta" and (attrs.get("name", "").lower() in ("description", "og:description")
                                or attrs.get("property", "").lower() == "og:description"):
            self.description = self.description or (attrs.get("content") or "").strip()
        elif tag == "a" and attrs.get("href"):
            self.links.append(attrs["href"])
        if tag in SKIP_TAGS and tag != "head":
            self._skip += 1
        if tag in ("p", "li", "h1", "h2", "h3", "h4", "br", "div", "section"):
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        if tag in SKIP_TAGS and tag != "head" and self._skip:
            self._skip -= 1

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        elif not self._skip:
            self.parts.append(data)

    def text(self) -> str:
        lines = (" ".join(chunk.split()) for chunk in "".join(self.parts).split("\n"))
        return "\n".join(line for line in lines if len(line) > 2)


def _fetch(url: str, timeout: int) -> tuple[str, str] | None:
    """Return (final_url, html) or None when the page can't be read."""
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml",
                                    "Accept-Language": "en"})
    try:
        with urlopen(request, timeout=timeout) as response:
            if "html" not in response.headers.get("Content-Type", "html"):
                return None
            raw = response.read(MAX_BYTES)
            return response.geturl(), _decode(raw, response.headers.get_content_charset())
    except (HTTPError, URLError, TimeoutError, OSError, ValueError):
        return None


def _decode(raw: bytes, declared: str | None) -> str:
    """Decode with the header charset, then the page's meta charset, then UTF-8, then Windows-1252."""
    meta = re.search(rb"<meta[^>]+charset=[\"']?([\w-]+)", raw[:4096], re.I)
    for charset in (declared, meta.group(1).decode() if meta else None, "utf-8"):
        if not charset:
            continue
        try:
            return raw.decode(charset)
        except (LookupError, UnicodeDecodeError):
            continue
    return raw.decode("cp1252", "replace")


def read_site(urls: list[str], *, limit: int = 12000, timeout: int = 8) -> tuple[str, list[str]]:
    """Read the first reachable URL plus one About-style page. Returns (text, urls actually read)."""
    pages: list[tuple[str, _Extractor]] = []
    for url in urls:
        fetched = _fetch(url, timeout)
        if fetched:
            parser = _Extractor()
            parser.feed(fetched[1])
            pages.append((fetched[0], parser))
            break
    if not pages:
        return "", []
    home_url, home = pages[0]
    host = urlparse(home_url).netloc
    for href in home.links:
        target = urljoin(home_url, href).split("#")[0]
        if urlparse(target).netloc == host and ABOUT_PATH.search(urlparse(target).path) and target != home_url:
            fetched = _fetch(target, timeout)
            if fetched:
                parser = _Extractor()
                parser.feed(fetched[1])
                pages.append((fetched[0], parser))
            break
    chunks = []
    for url, parser in pages:
        header = f"[{url}]"
        if parser.title.strip():
            header += f" Title: {' '.join(parser.title.split())}"
        if parser.description:
            header += f"\nDescription: {parser.description}"
        chunks.append(header + "\n" + parser.text())
    text = "\n\n".join(chunks)
    return text[:limit], [url for url, _ in pages]
