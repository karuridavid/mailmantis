"""Unit tests for the Microsoft Graph client and Gemini research parsing, with HTTP stubbed out."""
import io
import json
import urllib.error
import os
import sys
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("APP_ENCRYPTION_KEY", "q3tjJ3o2YyKpWQ0P3m5JvE8b3o0w7Z2W1m8Wm4WlGr0=")
import microsoft_api  # noqa: E402
from api import app  # noqa: E402

failures = 0


def check(cond, label):
    global failures
    print(("PASS " if cond else "FAIL ") + label)
    failures += not cond


class Resp(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *a): pass


# ---------------------------------------------------------------- Microsoft Graph
LOG = []
STATE = {"folder": "junk-id", "overrides": [], "rules": []}


def graph(req, timeout=0):
    url, method = req.full_url, req.get_method()
    body = json.loads(req.data) if req.data and req.headers.get("Content-type") == "application/json" else req.data
    LOG.append((method, url, body))
    path = urlparse(url).path
    reply = {}
    if path.endswith("/mailFolders/junkemail"):
        reply = {"id": "junk-id"}
    elif path.endswith("/mailFolders/inbox"):
        reply = {"id": "inbox-id"}
    elif path.endswith("/me/messages") and method == "GET":
        reply = {"value": [{"id": "AAMk/1", "parentFolderId": STATE["folder"], "inferenceClassification": "other",
                            "importance": "high", "conversationId": "conv-9", "flag": {"flagStatus": "notFlagged"}}]}
    elif path.endswith("/createReply"):
        reply = {"id": "draft/7", "internetMessageId": "<r1@outlook.com>"}
    elif path.endswith("/inferenceClassification/overrides") and method == "GET":
        reply = {"value": STATE["overrides"]}
    elif path.endswith("/messageRules") and method == "GET":
        reply = {"value": STATE["rules"]}
    elif path.endswith("/token"):
        reply = {"access_token": "new-access", "refresh_token": "new-refresh"}
    return Resp(json.dumps(reply).encode())


microsoft_api.urlopen = graph
place = microsoft_api.find_message_placement("t", "abc@example.com")
query = parse_qs(urlparse(LOG[0][1]).query)
check(query["$filter"] == ["internetMessageId eq '<abc@example.com>'"], "placement filters on internetMessageId with brackets")
check(place["placement"] == "Spam" and place["labels"] == "JUNK,IMPORTANT", "junk folder -> Spam with labels")
STATE["folder"] = "inbox-id"
place = microsoft_api.find_message_placement("t", "<abc@example.com>")
check(place["placement"] == "Inbox" and place["tab"] == "Other" and place["thread_id"] == "conv-9", "inbox + Other classification")

LOG.clear(); microsoft_api.not_junk("t", "abc@example.com")
check(LOG[-1][0] == "POST" and unquote(LOG[-1][1]).endswith("/messages/AAMk/1/markAsNotJunk") and LOG[-1][2] == {"moveToInbox": True}, "markAsNotJunk moves to inbox")
LOG.clear(); microsoft_api.mark_important("t", "abc@example.com")
check(LOG[-1][0] == "PATCH" and LOG[-1][2] == {"importance": "high"}, "mark important patches importance")
LOG.clear(); sent = microsoft_api.reply("t", "abc@example.com", "Thanks!\nSam")
steps = [(m, urlparse(u).path.rsplit("/", 1)[-1], b) for m, u, b in LOG[1:]]
check([s[1] for s in steps] == ["createReply", "draft%2F7", "send"] and steps[1][2] == {"body": {"contentType": "Text", "content": "Thanks!\nSam"}},
      "reply: createReply, plain-text body, send")
check(sent["message_id"] == "r1@outlook.com" and sent["thread_id"] == "conv-9", "reply ids returned")

STATE["overrides"] = [{"id": "o1", "classifyAs": "other", "senderEmailAddress": {"address": "Hi@Example.com"}}]
LOG.clear(); microsoft_api.create_filter("t", "hi@example.com", focused=True, important=True)
methods = [(m, urlparse(u).path.rsplit("/", 2)[-2:]) for m, u, b in LOG if m != "GET"]
check(methods[0] == ("PATCH", ["overrides", "o1"]) and LOG[[m for m, *_ in LOG].index("PATCH")][2] == {"classifyAs": "focused"},
      "existing Other override switched to Focused")
rule = [b for m, u, b in LOG if m == "POST" and u.endswith("/messageRules")][0]
check(rule["conditions"]["fromAddresses"][0]["emailAddress"]["address"] == "hi@example.com" and rule["actions"] == {"markImportance": "high"},
      "important rule for the exact sender")
STATE["overrides"] = [{"id": "o1", "classifyAs": "focused", "senderEmailAddress": {"address": "hi@example.com"}}]
STATE["rules"] = [rule | {"isEnabled": True}]
check(microsoft_api.filter_status("t", "HI@example.com") == {"never_spam": True, "important": True}, "filter status reads override + rule")
LOG.clear(); check(microsoft_api.create_filter("t", "hi@example.com", focused=True, important=True) is False and not [x for x in LOG if x[0] != "GET"], "no duplicates")
access, refreshed = microsoft_api.refresh("old", {"id": "c", "secret": "s"})
token_body = parse_qs(LOG[-1][2].decode())
check((access, refreshed) == ("new-access", "new-refresh") and token_body["grant_type"] == ["refresh_token"] and "offline_access" in token_body["scope"][0], "refresh rotates token")
url = microsoft_api.authorize_url({"id": "cid"}, "https://app.example.com/api/microsoft_oauth_callback", "st", "sam@outlook.com")
q = parse_qs(urlparse(url).query)
check(q["redirect_uri"] == ["https://app.example.com/api/microsoft_oauth_callback"] and q["login_hint"] == ["sam@outlook.com"] and "Mail.Send" in q["scope"][0], "authorize URL")

# ---------------------------------------------------------------- Gemini research
SENT = {}


def gemini(reply):
    def handler(req, timeout=0):
        SENT.update(json.loads(req.data))
        return Resp(json.dumps(reply).encode())
    return handler


app.urllib.request.urlopen = gemini({"candidates": [{"content": {"parts": [{"text": "Here you go:\n```json\n{\"summary\": \"A pottery studio.\", \"note\": \"\"}\n```"}]},
                                                    "groundingMetadata": {"groundingChunks": [{"web": {"uri": "https://vertexaisearch/redirect/1", "title": "fernhill.co.uk"}}]},
                                                    "urlContextMetadata": {"urlMetadata": [{"retrievedUrl": "https://fernhill.co.uk", "urlRetrievalStatus": "URL_RETRIEVAL_STATUS_SUCCESS"}]}}]})
app.site_reader.read_site = lambda urls, **kw: ("[https://fernhill.co.uk] Title: Fernhill", ["https://fernhill.co.uk"])
summary, sources = app.summarize_website({"provider": "gemini", "key": "k", "model": "gemini-3.8-flash"}, "fernhill.co.uk", ["https://fernhill.co.uk"])
check(SENT["tools"] == [{"url_context": {}}, {"google_search": {}}] and "responseMimeType" not in SENT["generationConfig"], "research tools on, no JSON mime")
check("Title: Fernhill" in SENT["contents"][0]["parts"][0]["text"], "fetched page text included in prompt")
check(summary == "A pottery studio." and sources == ["https://fernhill.co.uk", "fernhill.co.uk"], "summary parsed, sources deduplicated")
app.urllib.request.urlopen = gemini({"candidates": [{"content": {"parts": [{"text": "{\"summary\": \"\", \"note\": \"No information found\"}"}]}}]})
try:
    app.summarize_website({"provider": "gemini", "key": "k", "model": "gemini-3.8-flash"}, "nothing.example", ["https://nothing.example"])
    check(False, "empty summary raises")
except ValueError as exc:
    check("No information found" in str(exc) and "write the brief yourself" in str(exc), "empty summary explains why")

# ---------------------------------------------------------------- Other AI providers
import ai_clients  # noqa: E402

check(ai_clients.parse_json('Sure!\n```json\n{"body": "Hi"}\n```') == {"body": "Hi"}, "parse_json: fenced JSON")
check(ai_clients.parse_json("Plain brief text.", research=True) == {"summary": "Plain brief text."}, "parse_json: research text becomes the summary")
schema = ai_clients._json_schema(app.EMAILS_SCHEMA)
check(schema["properties"]["emails"]["items"]["additionalProperties"] is False and schema["properties"]["emails"]["items"]["properties"]["ref"] == {"type": "integer"},
      "Gemini schema converted to JSON Schema")

CHAT = {}


def chat(reply, status=200):
    def handler(req, timeout=0):
        CHAT.update(url=req.full_url, body=json.loads(req.data), auth=req.headers.get("Authorization"))
        if status != 200:
            raise urllib.error.HTTPError(req.full_url, status, "err", {}, io.BytesIO(json.dumps(reply).encode()))
        return Resp(json.dumps(reply).encode())
    return handler


ai_clients.urllib.request.urlopen = chat({"choices": [{"message": {"content": '{"body": "Thanks!"}'}, "finish_reason": "stop"}]})
data, _ = ai_clients.chat_request("groq", "gk", "openai/gpt-oss-120b", "Write")
check(data == {"body": "Thanks!"} and CHAT["url"] == "https://api.groq.com/openai/v1/chat/completions" and CHAT["auth"] == "Bearer gk"
      and CHAT["body"]["response_format"] == {"type": "json_object"}, "Groq chat request and JSON mode")
ai_clients.urllib.request.urlopen = chat({"choices": [{"message": {"content": '{"body": "Hey"}'}}]})
ai_clients.chat_request("openrouter", "ok", "openrouter/free", "Write")
check("response_format" not in CHAT["body"] and CHAT["url"].startswith("https://openrouter.ai/"), "OpenRouter skips JSON mode (free models vary)")
for status, payload, words in ((401, {"error": {"message": "bad key"}}, "rejected the API key"),
                               (429, {"error": {"message": "slow down"}}, "rate limit"),
                               (429, {"error": {"code": "insufficient_quota", "message": "quota"}}, "no credit"),
                               (404, {"error": {"message": "no model"}}, "doesn’t recognise")):
    ai_clients.urllib.request.urlopen = chat(payload, status)
    try:
        ai_clients.chat_request("openai", "k", "gpt-x", "Write")
        check(False, f"chat error {status} raises")
    except ai_clients.AIError as exc:
        check(words in str(exc), f"chat error {status}: {exc}")
app.site_reader.read_site = lambda urls, **kw: ("", [])
try:
    app.summarize_website({"provider": "groq", "key": "k", "model": "m"}, "blocked.example", ["https://blocked.example"])
    check(False, "text-only provider without page text raises")
except ValueError as exc:
    check("can’t open websites" in str(exc), "text-only provider explains it can’t read a blocked site")

CLAUDE = {}


class FakeBlock:
    def __init__(self, data):
        self.data = data

    def to_dict(self):
        return self.data


class FakeClaude:
    def __init__(self, **kw):
        CLAUDE["client"] = kw
        self.beta = self
        self.messages = self

    def create(self, **kw):
        CLAUDE.setdefault("calls", []).append(kw)
        if len(CLAUDE["calls"]) == 1 and kw.get("tools"):
            return type("R", (), {"stop_reason": "pause_turn", "content": [FakeBlock({"type": "server_tool_use", "name": "web_fetch"})]})()
        return type("R", (), {"stop_reason": "end_turn", "content": [
            FakeBlock({"type": "web_fetch_tool_result", "content": {"type": "web_fetch_result", "url": "https://fernhill.co.uk"}}),
            FakeBlock({"type": "text", "text": '{"summary": "Claude brief.", "note": ""}'})]})()


ai_clients.anthropic.Anthropic = FakeClaude
app.site_reader.read_site = lambda urls, **kw: ("[https://fernhill.co.uk] Title: Fernhill", ["https://fernhill.co.uk"])
summary, sources = app.summarize_website({"provider": "claude", "key": "ck", "model": "claude-opus-5-5"}, "fernhill.co.uk", ["https://fernhill.co.uk"])
first, second = CLAUDE["calls"]
check(summary == "Claude brief." and sources == ["https://fernhill.co.uk"], "Claude brief parsed with fetched sources")
check([t["type"] for t in first["tools"]] == ["web_fetch_20260209", "web_search_20260209"] and first["fallbacks"] == "default"
      and "server-side-fallback-2026-07-01" in first["betas"], "Claude research uses web fetch, web search and fallbacks")
check(len(second["messages"]) == 2 and second["messages"][1]["role"] == "assistant", "pause_turn resumes with the paused turn")
CLAUDE.clear()
ai_clients.claude_request("ck", "claude-opus-5-5", "Write", schema_def=app.REPLY_SCHEMA)
check(CLAUDE["calls"][0]["output_config"]["format"]["type"] == "json_schema" and "tools" not in CLAUDE["calls"][0], "Claude drafts use structured output")

# ---------------------------------------------------------------- OAuth app checks
import base64  # noqa: E402
import oauth_check  # noqa: E402


def fake_call(responses):
    def call(url, form=None):
        for key, value in responses.items():
            if key in url:
                return value(form) if callable(value) else value
        return 0, {}, ""
    return call


def auth_error(text):
    return "https://accounts.google.com/signin/oauth/error?authError=" + base64.urlsafe_b64encode(b"\n\x15" + text.encode()).decode().rstrip("=")


oauth_check._call = fake_call({"oauth2.googleapis.com": (400, {"error": "invalid_grant"}, ""),
                               "accounts.google.com": (302, {}, "https://accounts.google.com/v3/signin/identifier?x=1")})
r = oauth_check.check_google("id", "secret", "https://app.example.com/cb")
check([x["ok"] for x in r] == [True, True], "google: good keys and registered redirect")
oauth_check._call = fake_call({"oauth2.googleapis.com": (400, {"error": "invalid_grant"}, ""),
                               "accounts.google.com": (302, {}, auth_error("redirect_uri_mismatch"))})
r = oauth_check.check_google("id", "secret", "https://app.example.com/cb")
check(r[1]["ok"] is False and "https://app.example.com/cb" in r[1]["detail"], "google: redirect URI mismatch reported")
oauth_check._call = fake_call({"oauth2.googleapis.com": (401, {"error": "invalid_client", "error_description": "Unauthorized"}, "")})
r = oauth_check.check_google("id", "bad", "https://app.example.com/cb")
check(r[0]["ok"] is False and r[1]["ok"] is None, "google: bad secret stops the redirect check")

def ms(codes_common, codes_consumers=(9002313,)):
    return fake_call({"/common/": (400, {"error": "invalid_grant" if not set(codes_common) & {700016, 7000215, 7000222} else "invalid_client", "error_codes": list(codes_common)}, ""),
                      "/consumers/": (400, {"error": "invalid_grant", "error_codes": list(codes_consumers)}, "")})
oauth_check._call = ms((70000,))
r = oauth_check.check_microsoft("id", "secret", "https://app.example.com/cb")
check([x["ok"] for x in r] == [True, True, None], "microsoft: good keys, personal accounts allowed")
oauth_check._call = ms((7000215,))
check("Value" in oauth_check.check_microsoft("id", "bad", "u")[0]["detail"], "microsoft: wrong secret explains Value vs Secret ID")
oauth_check._call = ms((700016,))
check(oauth_check.check_microsoft("bad", "s", "u")[0]["ok"] is False, "microsoft: unknown app")
oauth_check._call = ms((70000,), (700016,))
check(oauth_check.check_microsoft("id", "s", "u")[1]["ok"] is False, "microsoft: personal accounts not enabled")

print("FAILURES:", failures)
sys.exit(1 if failures else 0)
