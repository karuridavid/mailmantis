#!/usr/bin/env python3
"""Standalone Mail Mantis server for self-hosting (Docker or plain Python).

Serves the dashboard and the same API that runs on Vercel. On first start it
creates the encryption key and the one-time admin setup key in DATA_DIR unless
they are provided as environment variables.
"""
from __future__ import annotations

import json
import mimetypes
import os
import secrets
import sys
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DATA_DIR = Path(os.getenv("DATA_DIR", ROOT / ".data"))
STATIC = {"/": "index.html", "/index.html": "index.html", "/app.js": "app.js", "/app.css": "app.css",
          "/robots.txt": "robots.txt"}
LOCAL_HOSTS = ("localhost", "127.0.0.1", "[::1]")


def load_secrets() -> None:
    """Fill APP_ENCRYPTION_KEY and ADMIN_SETUP_KEY from DATA_DIR, creating them once."""
    if os.getenv("APP_ENCRYPTION_KEY") and os.getenv("ADMIN_SETUP_KEY"):
        return
    from cryptography.fernet import Fernet
    path = DATA_DIR / "secrets.json"
    saved = json.loads(path.read_text()) if path.exists() else {}
    if not saved:
        saved = {"APP_ENCRYPTION_KEY": Fernet.generate_key().decode(), "ADMIN_SETUP_KEY": secrets.token_urlsafe(18)}
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(saved, indent=2))
        path.chmod(0o600)
    for name, value in saved.items():
        if not os.environ.get(name, "").strip():  # Compose passes unset variables as empty strings.
            os.environ[name] = value


load_secrets()
sys.path.insert(0, str(ROOT))
from api import app  # noqa: E402  (needs the secrets above)


class Handler(app.handler):
    server_version = "MailMantis"
    sys_version = ""

    def setup_request(self) -> None:
        host = self.headers.get("Host", "").split(":")[0].lower()
        trust_proxy = os.getenv("TRUST_PROXY", "") == "1"
        proto = (self.headers.get("X-Forwarded-Proto", "") if trust_proxy else "") or "http"
        self.scheme = proto
        # Browsers only keep Secure cookies over HTTPS or on localhost.
        self.cookie_secure = proto == "https" or host in LOCAL_HOSTS
        forwarded = self.headers.get("X-Forwarded-For", "") if trust_proxy else ""
        self.client_ip = forwarded.split(",")[0].strip() or self.client_address[0]

    def do_POST(self):
        self.setup_request()
        if urlparse(self.path).path != "/api/app":
            self.send_error(404)
            return
        super().do_POST()

    def do_GET(self):
        self.setup_request()
        path = urlparse(self.path).path
        if path.startswith("/api/"):
            super().do_GET()
            return
        if path == "/healthz":
            self.send_static(b"ok", "text/plain")
            return
        name = STATIC.get(path)
        if not name and path.startswith("/assets/") and ".." not in path:
            name = path.lstrip("/")
        file = ROOT / name if name else None
        if not file or not file.is_file():
            self.send_error(404)
            return
        self.send_static(file.read_bytes(), mimetypes.guess_type(file.name)[0] or "application/octet-stream",
                         cache="public, max-age=31536000, immutable" if path.startswith("/assets/") else "no-cache")

    def send_static(self, data: bytes, content_type: str, cache: str = "no-cache") -> None:
        self.send_response(200)
        self.send_header("Content-Type", content_type + ("; charset=utf-8" if content_type.startswith("text/") or content_type.endswith("javascript") else ""))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", cache)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("X-Robots-Tag", "noindex, nofollow")
        self.end_headers()
        self.wfile.write(data)


def announce_setup_key() -> None:
    try:
        conn = app.db()
        app.schema(conn)
        admins = app.one(conn, "SELECT COUNT(*) FROM admins")[0]
        conn.close()
    except Exception as exc:  # The database may still be starting; the app retries per request.
        print(f"Database not reachable yet ({type(exc).__name__}). Check DATABASE_URL.", flush=True)
        return
    if not admins:
        print(f"First sign-in: open the dashboard and use this one-time setup key: {os.environ['ADMIN_SETUP_KEY']}", flush=True)


def main() -> None:
    mimetypes.add_type("text/javascript", ".js")
    mimetypes.add_type("font/woff2", ".woff2")
    port = int(os.getenv("PORT", "8080"))
    host = os.getenv("HOST", "0.0.0.0")
    announce_setup_key()
    print(f"Mail Mantis listening on http://{'localhost' if host == '0.0.0.0' else host}:{port}", flush=True)
    ThreadingHTTPServer((host, port), Handler).serve_forever()


if __name__ == "__main__":
    main()
