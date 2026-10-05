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
os.environ.setdefault("IMAP_INSECURE_TLS", "1")  # IMAP inboxes on localhost use GreenMail's self-signed certificate.
sys.path.insert(0, str(ROOT))

import ai_clients  # noqa: E402
import gmail_api  # noqa: E402
import microsoft_api  # noqa: E402
import site_reader  # noqa: E402
import oauth_check  # noqa: E402
import server  # noqa: E402
from api import app  # noqa: E402

CALLS = []
PLACEMENTS = {}
PROFILE = {"email": "jane@gmail.com",
           "scope": "openid email https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send"}
NOT_FOUND = {"placement": "Not found", "tab": "", "labels": "", "gmail_id": "", "thread_id": ""}


def fake_gemini(api_key, model, prompt, *, schema_def=None, research=False, search=True):
    CALLS.append(["gemini", model, research, "<page_text>" in prompt, search, "<conversation>" in prompt, "business's next email" in prompt])
    if model == "gemini-zero":
        raise app.GeminiError("Your Gemini key has no quota for gemini-zero", "zero_quota")
    if model == "gemini-nosearch" and research and search:
        raise app.GeminiError("Gemini's Google Search quota is used up for now", "search")
    if research:
        return {"summary": "Fernhill Pottery makes small-batch stoneware in Bristol and runs weekend wheel-throwing classes."}, ["https://example.com"]
    if '"emails"' in prompt:
        n = prompt.count("- ref ")
        return {"emails": [{"ref": i, "subject": f"Subject {i}", "body": f"Hello {i}, body text."} for i in range(n)]}, []
    return {"body": "Thanks, this is great!"}, []


def fake_smtp_send(**kw):
    CALLS.append(["smtp_send", kw["from_email"], kw["from_name"], kw["to_email"], kw["subject"], kw.get("in_reply_to", ""), kw.get("references") or []])
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
gmail_api.find_message_placement = lambda token, mid, **kw: (CALLS.append(["gmail_find", mid, kw.get("sender", ""), kw.get("subject", ""), kw.get("sent_after", 0)])
                                                             or PLACEMENTS.get(mid.strip("<>"), NOT_FOUND))
gmail_api.send = fake_gmail_send
gmail_api.filter_status = lambda token, sender: {"never_spam": True, "important": False}
gmail_api.create_never_spam_filter = fake_create_filter
app.gemini_request = fake_gemini


def fake_other(name):
    def handler(*args, schema_def=None, research=False, **kw):
        prompt = args[-1]
        CALLS.append([name, args[-2], research])
        if args[-2] == "bad-model":
            raise ai_clients.AIError(f"{name} doesn’t recognise the model", "model")
        if research:
            return {"summary": f"{name} brief: Fernhill Pottery makes stoneware."}, []
        if '"emails"' in prompt:
            n = prompt.count("- ref ")
            return {"emails": [{"ref": i, "subject": f"{name} subject {i}", "body": f"{name} body {i}."} for i in range(n)]}, []
        return {"body": f"{name} reply", "ok": True}, []
    return handler


ai_clients.claude_request = fake_other("claude")
ai_clients.chat_request = lambda provider, *a, **kw: fake_other(provider)(*a, **kw)
app.gemini_models = lambda key: ["gemini-zero", "gemini-3.8-flash", "gemini-3.8-pro"]
site_reader.read_site = lambda urls, **kw: ("[https://example.com] Title: Fernhill Pottery", ["https://example.com"])

# Microsoft Graph fakes: one Outlook inbox whose messages live in MS_PLACEMENTS.
MS_PROFILE = {"email": "sam@outlook.com"}
MS_PLACEMENTS = {}
MS_FILTERS = {"never_spam": False, "important": False}
microsoft_api.exchange_code = lambda code, uri, client: (CALLS.append(["ms_exchange", uri, client["id"]]) or
                                                         {"access_token": "ms-acc", "refresh_token": "ms-ref-" + code})
microsoft_api.refresh = lambda refresh, client: ("ms-tok", refresh + "-rotated" if not refresh.endswith("-rotated") else refresh)
microsoft_api.profile_email = lambda token: MS_PROFILE["email"]
microsoft_api.find_message_placement = lambda token, mid: MS_PLACEMENTS.get(mid.strip("<>"), NOT_FOUND)
def ms_not_junk(token, mid):
    CALLS.append(["ms_not_junk", mid]); MS_PLACEMENTS[mid] = {**MS_PLACEMENTS[mid], "placement": "Inbox", "tab": "Focused", "labels": "INBOX,FOCUSED"}
def ms_important(token, mid):
    CALLS.append(["ms_important", mid]); MS_PLACEMENTS[mid] = {**MS_PLACEMENTS[mid], "labels": MS_PLACEMENTS[mid]["labels"] + ",IMPORTANT"}
microsoft_api.not_junk = ms_not_junk
microsoft_api.mark_important = ms_important
microsoft_api.reply = lambda token, mid, body: (CALLS.append(["ms_reply", mid, body]) or {"message_id": "ms-reply@outlook.com", "gmail_id": "", "thread_id": "conv-1"})
microsoft_api.filter_status = lambda token, sender: dict(MS_FILTERS)
def ms_create_filter(token, sender, focused=False, important=False):
    CALLS.append(["ms_filter", sender, focused, important])
    MS_FILTERS["never_spam"] |= focused; MS_FILTERS["important"] |= important
    return True
microsoft_api.create_filter = ms_create_filter
oauth_check.check_google = lambda cid, secret, uri: [{"label": "Client ID and secret", "ok": True, "detail": cid}, {"label": "Redirect URI", "ok": True, "detail": uri}]
oauth_check.check_microsoft = lambda cid, secret, uri, tenant="common": [{"label": "Application ID and secret", "ok": secret == "ms-secret", "detail": tenant}]
gmail_api.not_spam = lambda token, mid, gmail_id="": CALLS.append(["gmail_not_spam", mid, gmail_id])
gmail_api.mark_important = lambda token, mid, gmail_id="": CALLS.append(["gmail_important", mid, gmail_id])
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
            elif self.path == "/__test/ms_placement":
                MS_PLACEMENTS[body["message_id"]] = body["result"]
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
