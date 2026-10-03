"""Run Mail Mantis locally with Gmail, SMTP and Gemini replaced by fakes.

    docker run -d --name ms-test-db -e POSTGRES_PASSWORD=dev -p 55432:5432 postgres:16-alpine
    python tests/fake_server.py            # http://localhost:18080
    python tests/test_api.py               # in another terminal

Set DEMO=1 to load sample data for screenshots (sign in as demo@example.com / demo-password-123).
Nothing here talks to Google or a real mail server.
"""
import json
import os
import sys
from http.server import ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
os.environ.setdefault("DATABASE_URL", "postgresql://postgres:dev@localhost:55432/postgres")
os.environ.setdefault("APP_ENCRYPTION_KEY", "q3tjJ3o2YyKpWQ0P3m5JvE8b3o0w7Z2W1m8Wm4WlGr0=")
os.environ.setdefault("ADMIN_SETUP_KEY", "setup-key-123")
os.environ.setdefault("DATA_DIR", str(ROOT / ".data-test"))
sys.path.insert(0, str(ROOT))

import gmail_api  # noqa: E402
import server  # noqa: E402
from api import app  # noqa: E402

CALLS = []
PLACEMENTS = {}
PROFILE = {"email": "jane@gmail.com",
           "scope": "openid email https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send"}
NOT_FOUND = {"placement": "Not found", "tab": "", "labels": "", "gmail_id": "", "thread_id": ""}


def fake_gemini(api_key, model, prompt, *, schema_def=None, use_url_context=False):
    CALLS.append(["gemini", model, use_url_context])
    if use_url_context:
        return {"summary": "Fernhill Pottery makes small-batch stoneware in Bristol and runs weekend wheel-throwing classes."}, ["https://example.com"]
    if '"emails"' in prompt:
        n = prompt.count("- ref ")
        return {"emails": [{"ref": i, "subject": f"Subject {i}", "body": f"Hello {i}, body text."} for i in range(n)]}, []
    return {"body": "Thanks, this is great!"}, []


def fake_smtp_send(**kw):
    CALLS.append(["smtp_send", kw["from_email"], kw["from_name"], kw["to_email"], kw["subject"], kw.get("in_reply_to", "")])
    return "fake-%d@example.com" % len(CALLS)


def fake_verify_smtp(email, password, host, port, user=None):
    CALLS.append(["verify_smtp", email, host, port])
    if password == "bad":
        raise ValueError("Could not connect to the SMTP server.")


def fake_gmail_send(account, token, recipient, subject, body, *, in_reply_to="", thread_id="", from_name=""):
    CALLS.append(["gmail_send", account, recipient, subject, in_reply_to, thread_id])
    return {"message_id": "reply-%d@gmail.com" % len(CALLS), "gmail_id": "g-reply", "thread_id": thread_id or "t-new"}


def fake_create_filter(token, sender, never_spam=True, mark_important=False):
    CALLS.append(["create_filter", sender, never_spam, mark_important])
    return True


gmail_api.access_token = lambda refresh, client: "tok-" + refresh
gmail_api.exchange_code = lambda code, uri, client: (CALLS.append(["exchange_code", uri, client[0]]) or
                                                     {"access_token": "acc", "refresh_token": "ref-" + code, "scope": PROFILE["scope"]})
gmail_api.profile_email = lambda token: PROFILE["email"]
gmail_api.find_message_placement = lambda token, mid: PLACEMENTS.get(mid.strip("<>"), NOT_FOUND)
gmail_api.send = fake_gmail_send
gmail_api.filter_status = lambda token, sender: {"never_spam": True, "important": False}
gmail_api.create_never_spam_filter = fake_create_filter
app.gemini_request = fake_gemini
app.smtp_send = fake_smtp_send
app.verify_smtp = fake_verify_smtp


class TestHandler(server.Handler):
    def do_POST(self):
        if self.path.startswith("/__test/"):
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            if self.path == "/__test/placement":
                PLACEMENTS[body["message_id"]] = body["result"]
            elif self.path == "/__test/profile":
                PROFILE.update(body)
            data = json.dumps({"ok": True, "calls": CALLS}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        super().do_POST()


if __name__ == "__main__":
    if os.getenv("DEMO") == "1":
        from demo_data import load_demo
        load_demo(app, PLACEMENTS)
    port = int(os.getenv("PORT", "18080"))
    print(f"Fake-services server on http://localhost:{port}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), TestHandler).serve_forever()
