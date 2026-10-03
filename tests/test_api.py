"""End-to-end API test. Start tests/fake_server.py first (fake Gmail/SMTP/Gemini, real Postgres, empty database)."""
import imaplib, json, os, re, ssl, sys, time, urllib.request, urllib.error, urllib.parse, http.client
from email.message import EmailMessage

BASE = "http://127.0.0.1:18080"
cookie = ""
failures = 0


def call(endpoint, expect=200, **data):
    global cookie
    action = endpoint
    req = urllib.request.Request(BASE + "/api/app", data=json.dumps({"action": endpoint, **data}).encode(),
                                 headers={"Content-Type": "application/json", "Cookie": cookie}, method="POST")
    try:
        resp = urllib.request.urlopen(req)
        status, body, headers = resp.status, json.loads(resp.read()), resp.headers
    except urllib.error.HTTPError as e:
        status, body, headers = e.code, json.loads(e.read()), e.headers
    set_cookie = headers.get("Set-Cookie", "")
    if set_cookie:
        m = re.match(r"mailmon_session=([^;]*)", set_cookie)
        cookie = "mailmon_session=" + m.group(1) if m and m.group(1) else ""
    check(status == expect, f"{action} -> {status} (expected {expect}) {body if status != expect else ''}")
    return body


def check(cond, label):
    global failures
    print(("PASS " if cond else "FAIL ") + label)
    if not cond:
        failures += 1


def hook(path, **data):
    req = urllib.request.Request(BASE + "/__test/" + path, data=json.dumps(data).encode(), method="POST")
    return json.loads(urllib.request.urlopen(req).read())


def calls(kind):
    return [c for c in hook("calls")["calls"] if c[0] == kind]


def oauth(purpose, seed_id="", name=""):
    """Start an OAuth flow and follow the callback like Google would."""
    url = call("google_oauth_start", purpose=purpose, seed_id=seed_id, name=name)["url"]
    state = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)["state"][0]
    conn = http.client.HTTPConnection("127.0.0.1", 18080)
    conn.request("GET", "/api/google_oauth_callback?" + urllib.parse.urlencode({"state": state, "code": "c" + purpose}))
    resp = conn.getresponse()
    return resp.status, resp.getheader("Location")


# --- auth
call("status")
call("setup_admin", expect=401, setup_key="wrong", email="a@x.com", password="x" * 12)
call("setup_admin", setup_key="setup-key-123", email="admin@x.com", password="correct horse battery")
check(cookie != "", "session cookie set")
call("setup_admin", expect=409, setup_key="setup-key-123", email="b@x.com", password="x" * 12)

# --- Google OAuth client saved in Settings
cfg = call("get_config")
check(not cfg["google"]["ready"] and cfg["google"]["redirect_uri"] == BASE + "/api/google_oauth_callback", "redirect URI derived from request")
call("google_oauth_start", expect=400, purpose="connect")
call("save_google", expect=400, client_id="not-a-client-id", client_secret="s")
call("save_google", expect=400, client_id="123.apps.googleusercontent.com", client_secret="")
call("save_google", client_id="123.apps.googleusercontent.com", client_secret="shh")
g = call("get_config")["google"]
check(g["ready"] and g["source"] == "settings" and "secret" not in json.dumps(g), "google client saved, secret not exposed")

# --- 1. sender
call("test_sender", expect=400, email="hi@other.com", domain="example.com", smtp_host="h", smtp_port=587, password="p")
call("test_sender", email="hi@example.com", domain="example.com", smtp_host="smtp.test", smtp_port=587, password="p")
call("save_sender", expect=400, email="hi@example.com", domain="example.com", smtp_host="smtp.test", smtp_port=587, password="bad")
call("save_sender", email="hi@example.com", domain="example.com", smtp_host="smtp.test", smtp_port=587, password="p", from_name="Example Co")
cfg = call("get_config")
check(cfg["sender"]["from_name"] == "Example Co" and cfg["sender"]["verified_at"], "sender saved, verified, with from name")
check("password_enc" not in cfg["sender"], "sender password not exposed")

# --- 2. brief
call("generate_drafts", expect=400, seed_ids=["x"])  # no gemini/brief yet
call("save_ai", expect=400, provider="gemini", model="", key="")
call("save_ai", provider="gemini", model="", key="AIza-test")
check(call("get_config")["ai_model"] == "gemini-3.8-flash", "default model stored")
summary = call("analyze_website")
check("Pottery" in summary["summary"], "website summary returned")
call("save_website_brief", summary=summary["summary"] + " Edited by admin.", sources=summary["sources"])
check(call("get_config")["website_summary"].endswith("Edited by admin."), "edited brief saved")

# --- seeds via OAuth
status, loc = oauth("connect", name="Jane")
check(status == 302 and loc == "/?google=connected", f"connect callback -> {loc}")
check(calls("exchange_code")[-1][1:] == [BASE + "/api/google_oauth_callback", "123.apps.googleusercontent.com"], "code exchanged with saved client + derived redirect")
hook("profile", email="bob@workspace.io", scope="openid email https://www.googleapis.com/auth/gmail.modify")
status, loc = oauth("connect", name="")
check(loc == "/?google=connected", "second seed connected without send scope")
seeds = {s["email"]: s for s in call("get_config")["seeds"]}
jane, bob = seeds["jane@gmail.com"], seeds["bob@workspace.io"]
check(jane["gmail_send_enabled"] and not bob["gmail_send_enabled"], "send permission follows granted scope")
check(jane["name"] == "Jane" and bob["provider"] == "workspace", "seed name/provider")

# wrong account on a filter flow is rejected
hook("profile", email="someone@else.com")
status, loc = oauth("filter", seed_id=jane["id"])
check(loc.startswith("/?google=filter_error"), f"filter with wrong account rejected -> {loc}")
hook("profile", email="jane@gmail.com", scope="openid email https://www.googleapis.com/auth/gmail.settings.basic")
status, loc = oauth("filter", seed_id=jane["id"])
check(loc == "/?google=filter_added", f"filter added -> {loc}")
check(calls("create_filter")[-1] == ["create_filter", "hi@example.com", True, False], "never-spam filter for sender email")
jane = {s["email"]: s for s in call("get_config")["seeds"]}["jane@gmail.com"]
check(jane["filter_never_spam"] is True and jane["filter_important"] is False, "filter status stored after creation")
check(jane["gmail_send_enabled"], "send permission kept after filter re-consent")
res = call("check_filters")
check(all("never_spam" in r for r in res["results"].values()), "check_filters reads all oauth seeds")

# --- 3. drafts
res = call("generate_drafts", seed_ids=[jane["id"], bob["id"]], theme="autumn hours")
check(len(res["ids"]) == 2, "one Gemini draft per seed")
drafts = {d["id"]: d for d in call("get_config")["drafts"]}
d1, d2 = drafts[res["ids"][0]], drafts[res["ids"][1]]
check(d1["status"] == "draft" and d1["kind"] == "domain" and d1["to_email"] == "jane@gmail.com", "draft fields")
check("MAIL SIGNAL" not in d1["subject"] + d1["body"], "no test marker in drafts")
call("send_draft", expect=400, id=d1["id"])  # not ready
call("save_draft", id=d1["id"], subject="Autumn hours", body="Hi Jane, ...")
call("set_draft_status", id=d1["id"], status="ready")
blank = call("create_draft", seed_id=bob["id"])["id"]
call("set_draft_status", expect=400, id=blank, status="ready")  # empty draft can't be ready
call("write_with_gemini", id=blank, guidance="short")
check({d["id"]: d for d in call("get_config")["drafts"]}[blank]["body"].startswith("Hello"), "Gemini fills blank draft")
call("delete_draft", id=blank)

# --- send
res = call("send_draft", id=d1["id"])
sent = {d["id"]: d for d in call("get_config")["drafts"]}[d1["id"]]
check(sent["status"] == "sent" and sent["message_id"] and sent["sent_at"], "domain email sent")
check(calls("smtp_send")[-1][1:4] == ["hi@example.com", "Example Co", "jane@gmail.com"], "sent via SMTP with from name")
call("send_draft", expect=400, id=d1["id"])  # no double send
call("delete_draft", expect=400, id=d1["id"])
call("save_draft", expect=400, id=d1["id"], subject="x", body="y")

# --- 4. placement
res = call("check_placement")
check(res["results"] and res["results"][0]["placement"] == "Not found", "pending check: not found yet")
hook("placement", message_id=sent["message_id"], result={"placement": "Inbox", "tab": "Promotions", "labels": "CATEGORY_PROMOTIONS,INBOX", "gmail_id": "g1", "thread_id": "t1"})
res = call("check_placement")
check(res["results"][0]["placement"] == "Inbox", "pending check picks up Inbox")
sent = {d["id"]: d for d in call("get_config")["drafts"]}[d1["id"]]
check(sent["inbox_tab"] == "Promotions" and sent["gmail_thread_id"] == "t1", "tab and thread stored")
check(call("check_placement")["results"] == [], "found emails not re-checked automatically")
call("check_placement", id=sent["id"])
check(len(call("get_config")["activity"]) == 3, "each check logged")
call("check_placement", expect=400, id=d2["id"])  # unsent

# --- 6. reply
call("create_draft", expect=400, parent_id=d2["id"])  # parent unsent
reply_id = call("create_draft", parent_id=sent["id"])["id"]
r = {d["id"]: d for d in call("get_config")["drafts"]}[reply_id]
check(r["kind"] == "reply" and r["from_email"] == "jane@gmail.com" and r["to_email"] == "hi@example.com" and r["subject"] == "Re: Autumn hours", "reply draft addressed seed -> sender")
call("write_with_gemini", id=reply_id)
call("set_draft_status", id=reply_id, status="ready")
call("send_draft", id=reply_id)
g = calls("gmail_send")[-1]
check(g[1:3] == ["jane@gmail.com", "hi@example.com"] and g[4] == sent["message_id"] and g[5] == "t1", "reply sent via Gmail in the same thread")

# reply from a seed without send permission
d2r = {d["id"]: d for d in call("get_config")["drafts"]}[d2["id"]]
call("set_draft_status", id=d2["id"], status="ready"); call("send_draft", id=d2["id"])
rb = call("create_draft", parent_id=d2["id"])["id"]
call("save_draft", id=rb, subject="Re: x", body="thanks"); call("set_draft_status", id=rb, status="ready")
err = call("send_draft", expect=400, id=rb)
check("Allow sending replies" in err["error"], "reply blocked until send permission granted")

# --- seed management
call("set_seed_enabled", id=bob["id"], enabled=False)
call("generate_drafts", expect=400, seed_ids=[bob["id"]])
call("rename_seed", id=bob["id"], name="Bob")
check({s["id"]: s for s in call("get_config")["seeds"]}[bob["id"]]["name"] == "Bob", "rename seed")

# --- multiple sender domains, one active
cfg = call("get_config")
first = cfg["sender"]
check(len(cfg["senders"]) == 1 and first["active"] and "password_enc" not in first, "first sender is active")
call("save_sender", expect=400, email="hi@example.com", domain="example.com", smtp_host="smtp.test", smtp_port=587, password="p")  # duplicate address
second = call("save_sender", email="news@second.org", domain="second.org", smtp_host="smtp.test", smtp_port=465, password="p2", from_name="Second")["id"]
cfg = call("get_config")
check(len(cfg["senders"]) == 2 and cfg["sender"]["id"] == first["id"], "new domain saved as inactive")
call("save_website_brief", id=second, summary="Second org brief.")
cfg = call("get_config")
check(cfg["website_summary"] == first["brief"] and {x["id"]: x for x in cfg["senders"]}[second]["brief"] == "Second org brief.", "brief stored per domain")
leftover = call("create_draft", seed_id=jane["id"], subject="From first", body="Body")["id"]
call("set_draft_status", id=leftover, status="ready")
call("set_active_sender", id=second)
cfg = call("get_config")
check(cfg["sender"]["id"] == second and cfg["website_summary"] == "Second org brief.", "switching active domain")
check(all(s["filter_never_spam"] is None for s in cfg["seeds"]), "filter status reset on switch")
err = call("send_draft", expect=400, id=leftover)
check("sender changed" in err["error"], "draft from the previous domain cannot be sent")
ids = call("generate_drafts", seed_ids=[jane["id"]])["ids"]
check({d["id"]: d for d in call("get_config")["drafts"]}[ids[0]]["from_email"] == "news@second.org", "drafts use the active domain")
call("save_sender", id=second, email="news@second.org", domain="second.org", smtp_host="smtp.test", smtp_port=465, password="")  # keeps saved key
call("save_sender", id=second, email="news@third.org", domain="third.org", smtp_host="smtp.test", smtp_port=465, password="")
check(call("get_config")["website_summary"] == "", "changing a domain clears its brief")
call("delete_sender", expect=400, id=second)  # active with others present
call("set_active_sender", id=first["id"])
call("delete_sender", id=second)
check(len(call("get_config")["senders"]) == 1, "inactive domain deleted")

# --- Gemini brief uses the site text and research tools
g = [c for c in calls("gemini") if c[2]]
check(g and g[-1][3], "website brief sends fetched page text with URL context + search")

# --- Microsoft (Outlook) inboxes
call("microsoft_oauth_start", expect=400, purpose="connect")
call("save_microsoft", expect=400, client_id="not-a-guid", client_secret="x")
call("save_microsoft", client_id="11111111-2222-3333-4444-555555555555", client_secret="ms-secret")
cfg = call("get_config")
check(cfg["microsoft"]["ready"] and cfg["microsoft"]["redirect_uri"] == BASE + "/api/microsoft_oauth_callback", "microsoft client saved, redirect derived")

def ms_oauth(purpose, seed_id="", name=""):
    url = call("microsoft_oauth_start", purpose=purpose, seed_id=seed_id, name=name)["url"]
    check(url.startswith("https://login.microsoftonline.com/common/oauth2/v2.0/authorize"), "microsoft authorize URL")
    state = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)["state"][0]
    conn = http.client.HTTPConnection("127.0.0.1", 18080)
    conn.request("GET", "/api/microsoft_oauth_callback?" + urllib.parse.urlencode({"state": state, "code": "m" + purpose}))
    return conn.getresponse().getheader("Location")

check(ms_oauth("connect", name="Sam") == "/?google=connected", "outlook inbox connected")
sam = {x["email"]: x for x in call("get_config")["seeds"]}["sam@outlook.com"]
check(sam["kind"] == "microsoft" and sam["provider"] == "outlook" and sam["gmail_send_enabled"], "outlook seed stored")
check(ms_oauth("filter", seed_id=sam["id"]) == "/?google=filter_added", "outlook Always Focused override")
check(ms_oauth("filter_important", seed_id=sam["id"]) == "/?google=filter_added", "outlook important rule")
sam = {x["email"]: x for x in call("get_config")["seeds"]}["sam@outlook.com"]
check(sam["filter_never_spam"] is True and sam["filter_important"] is True, "outlook filter status stored")
check(calls("ms_filter")[-2][1:] == ["hi@example.com", True, False] and calls("ms_filter")[-1][1:] == ["hi@example.com", False, True], "filters created for the sender")

ms_draft = call("create_draft", seed_id=sam["id"], subject="Hello Sam", body="Hi Sam")["id"]
call("set_draft_status", id=ms_draft, status="ready"); call("send_draft", id=ms_draft)
ms_msg = {d["id"]: d for d in call("get_config")["drafts"]}[ms_draft]["message_id"]
hook("ms_placement", message_id=ms_msg, result={"placement": "Spam", "tab": "", "labels": "JUNK", "gmail_id": "AAMk1", "thread_id": "conv-1"})
check(call("check_placement", id=ms_draft)["results"][0]["placement"] == "Spam", "outlook Junk reported as Spam")
import psycopg
with psycopg.connect(os.environ.get("DATABASE_URL", "postgresql://postgres:dev@localhost:55432/postgres")) as db:
    from cryptography.fernet import Fernet
    stored = db.execute("SELECT oauth_refresh_enc FROM seed_accounts WHERE id=%s", (sam["id"],)).fetchone()[0]
    key = os.environ.get("APP_ENCRYPTION_KEY", "q3tjJ3o2YyKpWQ0P3m5JvE8b3o0w7Z2W1m8Wm4WlGr0=")
    check(Fernet(key.encode()).decrypt(stored.encode()).decode().endswith("-rotated"), "rotated Microsoft refresh token saved")
r = call("message_action", id=ms_draft, op="not_spam")
check(r["result"]["placement"] == "Inbox" and r["result"]["tab"] == "Focused", "outlook not junk -> Inbox · Focused")
r = call("message_action", id=ms_draft, op="important")
check("IMPORTANT" in r["result"]["labels"], "outlook mark important")
call("message_action", expect=400, id=ms_draft, op="delete")
ms_reply = call("create_draft", parent_id=ms_draft)["id"]
call("save_draft", id=ms_reply, subject="Re: Hello Sam", body="Thanks!"); call("set_draft_status", id=ms_reply, status="ready")
call("send_draft", id=ms_reply)
check(calls("ms_reply")[-1][1:] == [ms_msg, "Thanks!"], "outlook reply sent in thread")
res = call("check_filters")["results"]
check(res[sam["id"]] == {"never_spam": True, "important": True}, "check_filters reads outlook")

# --- IMAP inboxes (real GreenMail server on localhost)
GM = {"provider": "imap", "email": "seed@test.local", "imap_host": "localhost", "imap_port": 3993, "smtp_host": "localhost", "smtp_port": 3465}
call("connect_imap", expect=400, **GM, password="wrong")
call("connect_imap", expect=400, provider="yahoo", email="x@yahoo.com", password="")
r = call("connect_imap", **GM, password="apppass", name="Gina")
check(r["message"] == "Other IMAP inbox connected", "imap inbox connected after sign-in test")
gina = {x["email"]: x for x in call("get_config")["seeds"]}["seed@test.local"]
check(gina["kind"] == "imap" and gina["imap_host"] == "localhost" and gina["gmail_send_enabled"], "imap seed stored")
im_draft = call("create_draft", seed_id=gina["id"], subject="Hello Gina", body="Hi Gina")["id"]
call("set_draft_status", id=im_draft, status="ready"); call("send_draft", id=im_draft)
im_msg = {d["id"]: d for d in call("get_config")["drafts"]}[im_draft]["message_id"]
ctx = ssl._create_unverified_context()
box = imaplib.IMAP4_SSL("localhost", 3993, ssl_context=ctx); box.login("seed@test.local", "apppass")
box.create("Junk")
m = EmailMessage(); m["From"] = "hi@example.com"; m["To"] = "seed@test.local"; m["Subject"] = "Hello Gina"; m["Message-ID"] = f"<{im_msg}>"; m.set_content("Hi")
box.append("Junk", None, imaplib.Time2Internaldate(time.time()), m.as_bytes()); box.logout()
check(call("check_placement", id=im_draft)["results"][0]["placement"] == "Spam", "imap Junk reported as Spam")
r = call("message_action", id=im_draft, op="not_spam")
check(r["result"]["placement"] == "Inbox", "imap not spam moves to INBOX")
r = call("message_action", id=im_draft, op="important")
check("FLAGGED" in r["result"]["labels"], "imap important flags message")
im_reply = call("create_draft", parent_id=im_draft)["id"]
call("save_draft", id=im_reply, subject="Re: Hello Gina", body="Lovely, thanks"); call("set_draft_status", id=im_reply, status="ready")
call("send_draft", id=im_reply)
check({d["id"]: d for d in call("get_config")["drafts"]}[im_reply]["status"] == "sent", "imap reply sent over SMTP")
check(gina["id"] not in call("check_filters")["results"], "imap inboxes skipped by filter checks")

# --- connection checks
g = call("check_oauth", provider="google")["checks"]
check(g[1]["detail"] == BASE + "/api/google_oauth_callback", "google check uses the derived redirect URI")
check(call("check_oauth", provider="microsoft")["checks"][0]["ok"] is True, "microsoft check runs with saved keys")
call("check_oauth", expect=400, provider="yahoo")

# --- people: invites and member accounts
inv = call("create_invite", name="Alex", email="alex@gmail.com")
token = inv["url"].split("#/join/")[1]
check(inv["url"].startswith(BASE + "/#/join/") and inv["days"] == 7, "invite link created")
call("create_invite", expect=400, email="admin@x.com")  # already has an account
pending = call("get_config")["invites"]
check(len(pending) == 1 and pending[0]["email"] == "alex@gmail.com", "pending invite listed")
admin_cookie = cookie
cookie = ""
check(call("invite_info", token=token)["email"] == "alex@gmail.com", "invite info is public")
call("invite_info", expect=404, token="nope")
call("accept_invite", expect=400, token=token, password="short")
r = call("accept_invite", token=token, email="someone-else@x.com", name="", password="alex-password-123")
check(r["user"]["role"] == "member" and r["user"]["email"] == "alex@gmail.com" and r["user"]["name"] == "Alex", "member created with the invited email")
call("accept_invite", expect=404, token=token, password="alex-password-123")  # links work once
mc = call("get_config")
check(mc["role"] == "member" and mc["seeds"] == [] and "drafts" not in mc and "senders" not in mc and "people" not in mc, "member sees only their own inboxes")
for blocked in ("generate_drafts", "save_sender", "create_invite", "connect_imap", "check_placement", "send_draft", "check_oauth", "save_google", "message_action"):
    call(blocked, expect=403)
call("remove_seed", expect=400, id=jane["id"])  # someone else's inbox
call("google_oauth_start", expect=400, purpose="send", seed_id=jane["id"])
hook("profile", email="alex@gmail.com", scope="openid email https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send")
check(oauth("connect", name="Alex") == (302, "/?google=connected"), "member connects their Gmail")
mine = call("get_config")["seeds"]
check([x["email"] for x in mine] == ["alex@gmail.com"], "member sees the inbox they connected")
call("rename_seed", id=mine[0]["id"], name="Alex P")
call("change_password", current_password="alex-password-123", new_password="alex-password-456")
cookie = ""
call("login", email="alex@gmail.com", password="alex-password-456")
check(call("get_config")["seeds"][0]["name"] == "Alex P", "member renames own inbox and changes password")
member_cookie = cookie
cookie = admin_cookie
alex_seed = {x["email"]: x for x in call("get_config")["seeds"]}["alex@gmail.com"]
check(alex_seed["owner"] == {"email": "alex@gmail.com", "name": "Alex"}, "admin sees who added the inbox")
alex = [x for x in call("get_config")["people"] if x["email"] == "alex@gmail.com"][0]
check(alex["inboxes"] == 1 and alex["role"] == "member", "people list counts inboxes")
inv2 = call("create_invite", name="Sam")
call("revoke_invite", id=[i for i in call("get_config")["invites"] if i["name"] == "Sam"][0]["id"])
cookie = ""
call("invite_info", expect=404, token=inv2["url"].split("#/join/")[1])
cookie = admin_cookie
call("remove_person", expect=400, id=call("get_config")["user"]["id"])  # admins aren't removed here
r = call("remove_person", id=alex["id"])
check("1 inbox" in r["message"] and "alex@gmail.com" not in [x["email"] for x in call("get_config")["seeds"]], "removing a person disconnects their inboxes")
cookie = member_cookie
call("get_config", expect=401)
cookie = admin_cookie

# --- removed actions are gone
call("run_check", expect=400)
call("rotate_cron", expect=400)

# --- logout
call("logout"); call("get_config", expect=401)
print("\nFAILURES:", failures)
sys.exit(1 if failures else 0)
