"""Test imap_box against a real IMAP server (GreenMail).

    docker run -d --name ms-greenmail -p 3993:3993 -p 3465:3465 \
      -e GREENMAIL_OPTS="-Dgreenmail.setup.test.all -Dgreenmail.hostname=0.0.0.0 -Dgreenmail.users=seed:apppass@test.local -Dgreenmail.users.login=email" \
      greenmail/standalone:2.1.2
    python tests/test_imap_box.py
"""
import imaplib
import ssl
import sys
import time
from email.message import EmailMessage
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import imap_box  # noqa: E402

CTX = ssl._create_unverified_context()  # GreenMail uses a self-signed certificate.
CFG = {"email": "seed@test.local", "password": "apppass", "imap_host": "localhost", "imap_port": 3993,
       "smtp_host": "localhost", "smtp_port": 3465, "ssl_context": CTX}
failures = 0


def check(cond, label):
    global failures
    print(("PASS " if cond else "FAIL ") + label)
    failures += not cond


def append(client, folder, message_id, subject="Hello"):
    msg = EmailMessage()
    msg["From"] = "hi@example.com"
    msg["To"] = CFG["email"]
    msg["Subject"] = subject
    msg["Message-ID"] = f"<{message_id}>"
    msg.set_content("Body")
    client.append(folder, None, imaplib.Time2Internaldate(time.time()), msg.as_bytes())


client = imaplib.IMAP4_SSL("localhost", 3993, ssl_context=CTX)
client.login(CFG["email"], CFG["password"])
for folder in ("Bulk", "Archive", "Trash"):
    client.create(folder)
append(client, "Bulk", "spam-1@example.com")
append(client, "INBOX", "inbox-1@example.com")
append(client, "Archive", "other-1@example.com")
append(client, "Trash", "trash-1@example.com")
client.logout()

roles = dict(imap_box.folders(imap_box.connect(CFG)).__iter__())
check(roles.get("Bulk") == "junk" and roles.get("Archive") == "other" and "Trash" not in roles, f"folder roles {roles}")

check(imap_box.find_message_placement(CFG, "spam-1@example.com")["placement"] == "Spam", "Bulk folder reported as Spam")
check(imap_box.find_message_placement(CFG, "<inbox-1@example.com>")["placement"] == "Inbox", "INBOX reported as Inbox")
check(imap_box.find_message_placement(CFG, "other-1@example.com")["placement"] == "Other folder", "Archive reported as Other folder")
check(imap_box.find_message_placement(CFG, "trash-1@example.com")["placement"] == "Not found", "Trash is ignored")
check(imap_box.find_message_placement(CFG, "missing@example.com")["placement"] == "Not found", "missing message")

imap_box.move_to_inbox(CFG, "spam-1@example.com")
check(imap_box.find_message_placement(CFG, "spam-1@example.com")["placement"] == "Inbox", "not spam moves Bulk -> INBOX")

imap_box.flag(CFG, "inbox-1@example.com")
check("FLAGGED" in imap_box.find_message_placement(CFG, "inbox-1@example.com")["labels"], "important sets \\Flagged")

# Fallback search path: servers whose HEADER search finds nothing.
original = imap_box._search
def header_search_broken(client, message_id, sent_after):
    real_uid = client.uid
    def uid(command, *args):
        if command == "SEARCH" and args[1:2] == ("HEADER",):
            return "OK", [b""]
        return real_uid(command, *args)
    client.uid = uid
    try:
        return original(client, message_id, sent_after)
    finally:
        client.uid = real_uid
imap_box._search = header_search_broken
check(imap_box.find_message_placement(CFG, "other-1@example.com")["placement"] == "Other folder", "fallback scan of recent Message-IDs")
imap_box._search = original

# Copy-and-delete path for servers without MOVE.
c = imaplib.IMAP4_SSL("localhost", 3993, ssl_context=CTX); c.login(CFG["email"], CFG["password"]); append(c, "Bulk", "spam-2@example.com"); c.logout()
real_connect = imap_box.connect
def connect_without_move(cfg):
    client = real_connect(cfg)
    client.capabilities = tuple(x for x in client.capabilities if x != "MOVE")
    return client
imap_box.connect = connect_without_move
imap_box.move_to_inbox(CFG, "spam-2@example.com")
imap_box.connect = real_connect
check(imap_box.find_message_placement(CFG, "spam-2@example.com")["placement"] == "Inbox", "not spam without MOVE (copy + delete)")

try:
    imap_box.verify({**CFG, "password": "wrong"})
    check(False, "wrong password rejected")
except ValueError:
    check(True, "wrong password rejected")
try:
    imap_box.verify(CFG)
    check(True, "verify signs in to IMAP and SMTP")
except ValueError as exc:
    check(False, f"verify: {exc}")

print("FAILURES:", failures)
sys.exit(1 if failures else 0)
