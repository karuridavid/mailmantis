"""IMAP seed inboxes: Yahoo, AOL, iCloud or any IMAP provider, using an app password.

IMAP has no filter API, so these inboxes support placement checks, per-message
"not spam" (move from the junk folder to INBOX) and "important" (\\Flagged),
and replies sent over the provider's SMTP server.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import imaplib
import re
import smtplib
import ssl

PRESETS = {
    "yahoo": {"label": "Yahoo Mail", "imap_host": "imap.mail.yahoo.com", "imap_port": 993, "smtp_host": "smtp.mail.yahoo.com", "smtp_port": 465,
              "help": "Create an app password in Yahoo Account security → Generate app password."},
    "aol": {"label": "AOL Mail", "imap_host": "imap.aol.com", "imap_port": 993, "smtp_host": "smtp.aol.com", "smtp_port": 465,
            "help": "Create an app password in AOL Account security → Generate app password."},
    "icloud": {"label": "iCloud Mail", "imap_host": "imap.mail.me.com", "imap_port": 993, "smtp_host": "smtp.mail.me.com", "smtp_port": 587,
               "help": "Create an app-specific password at account.apple.com → Sign-In and Security."},
    "imap": {"label": "Other IMAP", "imap_host": "", "imap_port": 993, "smtp_host": "", "smtp_port": 587,
             "help": "Use your provider's IMAP and SMTP settings. Many providers require an app password."},
}
JUNK_NAMES = ("spam", "junk", "bulk")
SKIP_FOLDERS = ("trash", "deleted", "drafts", "sent", "outbox")
LIST_LINE = re.compile(r'\((?P<flags>[^)]*)\)\s+(?P<delim>"[^"]*"|NIL)\s+(?P<name>.+)$')


def tls_context() -> ssl.SSLContext:
    return ssl.create_default_context()


def connect(cfg: dict) -> imaplib.IMAP4_SSL:
    try:
        client = imaplib.IMAP4_SSL(cfg["imap_host"], int(cfg.get("imap_port") or 993), ssl_context=cfg.get("ssl_context") or tls_context(), timeout=15)
        client.login(cfg.get("login") or cfg["email"], cfg["password"])
        return client
    except (OSError, imaplib.IMAP4.error):
        raise ValueError("Could not sign in over IMAP. Check the address, app password and server settings") from None


def verify(cfg: dict) -> None:
    """Check IMAP and SMTP sign-in with the same app password."""
    client = connect(cfg)
    try:
        client.select("INBOX", readonly=True)
    finally:
        _logout(client)
    try:
        with open_smtp(cfg):
            pass
    except (OSError, smtplib.SMTPException):
        raise ValueError("IMAP works, but SMTP sign-in failed. Check the SMTP server, port and app password") from None


def open_smtp(cfg: dict) -> smtplib.SMTP:
    """Signed-in SMTP session. 465 is implicit TLS, 25/587/2525 use STARTTLS, other ports try both."""
    port = int(cfg.get("smtp_port") or 587)
    context = cfg.get("ssl_context") or tls_context()
    attempts = ["ssl"] if port == 465 else ["starttls"] if port in (25, 587, 2525) else ["ssl", "starttls"]
    for i, mode in enumerate(attempts):
        try:
            if mode == "ssl":
                smtp = smtplib.SMTP_SSL(cfg["smtp_host"], port, timeout=15, context=context)
            else:
                smtp = smtplib.SMTP(cfg["smtp_host"], port, timeout=15)
                smtp.ehlo(); smtp.starttls(context=context); smtp.ehlo()
            smtp.login(cfg.get("login") or cfg["email"], cfg["password"])
            return smtp
        except (OSError, smtplib.SMTPException):
            if i == len(attempts) - 1:
                raise
    raise smtplib.SMTPException("No SMTP connection")


def send_reply(cfg: dict, message) -> None:
    try:
        with open_smtp(cfg) as smtp:
            smtp.send_message(message)
    except (OSError, smtplib.SMTPException):
        raise ValueError("The reply could not be sent. Check this inbox's SMTP settings and app password") from None


def _logout(client) -> None:
    try:
        client.logout()
    except (OSError, imaplib.IMAP4.error):
        pass


def _quote(name: str) -> str:
    return '"' + name.replace("\\", "\\\\").replace('"', '\\"') + '"'


def folders(client) -> list[tuple[str, str]]:
    """[(folder name, role)] with role inbox, junk or other; trash/drafts/sent are skipped."""
    typ, listing = client.list()
    found = [("INBOX", "inbox")]
    if typ != "OK":
        return found
    for raw in listing or []:
        line = raw.decode("utf-8", "replace") if isinstance(raw, bytes) else str(raw)
        match = LIST_LINE.match(line.strip())
        if not match:
            continue
        flags = match.group("flags").lower()
        name = match.group("name").strip()
        if name.startswith('"') and name.endswith('"'):
            name = name[1:-1].replace('\\"', '"').replace("\\\\", "\\")
        lower = name.lower()
        if lower == "inbox" or "\\noselect" in flags or "\\nonexistent" in flags:
            continue
        if "\\junk" in flags or any(word in lower.rsplit("/", 1)[-1].rsplit(".", 1)[-1] for word in JUNK_NAMES):
            found.append((name, "junk"))
        elif not any(flag in flags for flag in ("\\trash", "\\drafts", "\\sent")) and not any(word in lower for word in SKIP_FOLDERS):
            found.append((name, "other"))
    return sorted(found, key=lambda item: {"inbox": 0, "junk": 1, "other": 2}[item[1]])


def _search(client, message_id: str, sent_after: datetime | None) -> list[bytes]:
    """UIDs of messages with this Message-ID in the selected folder."""
    wanted = "<" + message_id.strip().strip("<>") + ">"
    try:
        typ, data = client.uid("SEARCH", None, "HEADER", "Message-ID", _quote(wanted))
        if typ == "OK" and data and data[0]:
            return data[0].split()
    except imaplib.IMAP4.error:
        pass
    # Some servers (Yahoo) search headers unreliably: scan recent messages' Message-ID headers instead.
    since = (sent_after or datetime.now(timezone.utc) - timedelta(days=3)) - timedelta(days=1)
    typ, data = client.uid("SEARCH", None, "SINCE", since.strftime("%d-%b-%Y"))
    if typ != "OK" or not data or not data[0]:
        return []
    uids = data[0].split()[-200:]
    typ, fetched = client.uid("FETCH", b",".join(uids).decode(), "(UID BODY.PEEK[HEADER.FIELDS (MESSAGE-ID)])")
    matches = []
    for item in fetched or []:
        if isinstance(item, tuple) and wanted.lower().encode() in item[1].lower():
            uid = re.search(rb"UID (\d+)", item[0])
            if uid:
                matches.append(uid.group(1))
    return matches


def _locate(client, message_id: str, sent_after: datetime | None):
    for name, role in folders(client):
        try:
            if client.select(_quote(name) if name != "INBOX" else "INBOX")[0] != "OK":
                continue
            uids = _search(client, message_id, sent_after)
            if uids:
                return name, role, uids[-1]
        except (imaplib.IMAP4.error, OSError):
            continue
    return None


def find_message_placement(cfg: dict, message_id: str, sent_after: datetime | None = None) -> dict[str, str]:
    empty = {"placement": "Not found", "tab": "", "labels": "", "gmail_id": "", "thread_id": ""}
    if not message_id or any(ch in message_id for ch in '\r\n"'):
        return empty
    client = connect(cfg)
    try:
        found = _locate(client, message_id, sent_after)
        if not found:
            return empty
        name, role, uid = found
        typ, data = client.uid("FETCH", uid, "(FLAGS)")
        flags = data[0].decode("utf-8", "replace") if typ == "OK" and data and isinstance(data[0], bytes) else ""
        labels = [name.upper()] + (["FLAGGED"] if "\\Flagged" in flags else [])
        placement = {"inbox": "Inbox", "junk": "Spam", "other": "Other folder"}[role]
        return {**empty, "placement": placement, "labels": ",".join(labels)}
    finally:
        _logout(client)


def move_to_inbox(cfg: dict, message_id: str, sent_after: datetime | None = None) -> None:
    """Not spam: move the message from its folder to INBOX."""
    client = connect(cfg)
    try:
        found = _locate(client, message_id, sent_after)
        if not found:
            raise ValueError("The message was not found in this inbox")
        name, role, uid = found
        if role == "inbox":
            return
        client.select(_quote(name), readonly=False)
        typ = client.uid("MOVE", uid, "INBOX")[0] if "MOVE" in client.capabilities else "NO"
        if typ != "OK":
            # Servers without MOVE: copy, then delete the original.
            if client.uid("COPY", uid, "INBOX")[0] != "OK":
                raise ValueError("The server refused to move the message")
            client.uid("STORE", uid, "+FLAGS.SILENT", "(\\Deleted)")
            client.expunge()
    finally:
        _logout(client)


def flag(cfg: dict, message_id: str, sent_after: datetime | None = None) -> None:
    """Important: set \\Flagged (shown as starred or flagged by Yahoo, AOL and iCloud)."""
    client = connect(cfg)
    try:
        found = _locate(client, message_id, sent_after)
        if not found:
            raise ValueError("The message was not found in this inbox")
        name, _, uid = found
        client.select(_quote(name) if name != "INBOX" else "INBOX", readonly=False)
        if client.uid("STORE", uid, "+FLAGS.SILENT", "(\\Flagged)")[0] != "OK":
            raise ValueError("The server refused to flag the message")
    finally:
        _logout(client)
