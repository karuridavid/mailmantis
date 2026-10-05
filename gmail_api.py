"""Small Gmail API client for OAuth-connected seed inboxes."""
from __future__ import annotations

import base64
from email.message import EmailMessage
from email.utils import make_msgid
import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, quote
from urllib.request import Request, urlopen


TOKEN_URL = "https://oauth2.googleapis.com/token"
API_ROOT = "https://gmail.googleapis.com/gmail/v1/users/me"
INBOX_TABS = {"CATEGORY_PERSONAL": "Primary", "CATEGORY_PROMOTIONS": "Promotions",
              "CATEGORY_UPDATES": "Updates", "CATEGORY_SOCIAL": "Social", "CATEGORY_FORUMS": "Forums"}


def _request(url: str, *, data: bytes | None = None, access_token: str | None = None,
             method: str | None = None, timeout: int = 20) -> dict:
    headers = {"Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/x-www-form-urlencoded" if "oauth2.googleapis.com" in url else "application/json"
    if access_token:
        headers["Authorization"] = "Bearer " + access_token
    request = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=timeout) as response:
            return json.loads(response.read() or b"{}")
    except HTTPError as exc:
        # Never include response bodies or tokens in application logs/errors.
        if exc.code == 403:
            raise PermissionError("Gmail refused this request. The account may need to grant more access") from exc
        raise RuntimeError("Gmail request failed") from exc
    except (URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise RuntimeError("Gmail request failed") from exc


def access_token(refresh_token: str, client: tuple[str, str]) -> str:
    client_id, client_secret = client
    if not client_id or not client_secret:
        raise RuntimeError("Google OAuth is not configured")
    data = urlencode({"client_id": client_id, "client_secret": client_secret,
                      "refresh_token": refresh_token, "grant_type": "refresh_token"}).encode()
    token = _request(TOKEN_URL, data=data).get("access_token")
    if not token:
        raise RuntimeError("Google could not refresh the mailbox connection")
    return token


def exchange_code(code: str, redirect_uri: str, client: tuple[str, str]) -> dict:
    client_id, client_secret = client
    if not client_id or not client_secret:
        raise RuntimeError("Google OAuth is not configured")
    data = urlencode({"client_id": client_id, "client_secret": client_secret, "code": code,
                      "redirect_uri": redirect_uri, "grant_type": "authorization_code"}).encode()
    return _request(TOKEN_URL, data=data)


def profile_email(token: str) -> str:
    result = _request(API_ROOT + "/profile", access_token=token)
    address = str(result.get("emailAddress", "")).strip().lower()
    if "@" not in address:
        raise RuntimeError("Google did not return an email address")
    return address


def _api(token: str, path: str, *, payload: dict | None = None, query: dict | None = None,
         method: str | None = None) -> dict:
    url = API_ROOT + path
    if query:
        url += "?" + urlencode(query, doseq=True)
    data = json.dumps(payload).encode() if payload is not None else None
    return _request(url, data=data, access_token=token, method=method or ("POST" if data else None))


def _sender_filters(token: str, sender_email: str) -> list[dict]:
    filters = _api(token, "/settings/filters").get("filter", [])
    return [item for item in filters
            if str(item.get("criteria", {}).get("from", "")).strip().lower() == sender_email.lower()]


def filter_status(token: str, sender_email: str) -> dict[str, bool]:
    """Report whether Gmail has filters for this exact sender that skip Spam / mark Important."""
    never_spam = important = False
    for item in _sender_filters(token, sender_email):
        action = item.get("action", {})
        never_spam = never_spam or "SPAM" in action.get("removeLabelIds", [])
        important = important or "IMPORTANT" in action.get("addLabelIds", [])
    return {"never_spam": never_spam, "important": important}


def create_never_spam_filter(token: str, sender_email: str, *, never_spam: bool = True,
                             mark_important: bool = False) -> bool:
    """Ensure selected Gmail actions for the exact sender while preserving other filter actions."""
    for item in _sender_filters(token, sender_email):
        criteria = item.get("criteria", {})
        action = item.get("action", {})
        add = set(action.get("addLabelIds", []))
        remove = set(action.get("removeLabelIds", []))
        wanted = ((not never_spam or "SPAM" in remove) and
                  (not mark_important or ("IMPORTANT" in add and "IMPORTANT" not in remove)))
        if wanted:
            return False
        # Gmail filters cannot be edited. Replace this exact-sender filter while
        # retaining its other criteria and actions (for example forwarding).
        if never_spam:
            remove.add("SPAM")
        if mark_important:
            add.add("IMPORTANT")
            remove.discard("IMPORTANT")
        _api(token, "/settings/filters", payload={
            "criteria": criteria,
            "action": {**action, "addLabelIds": sorted(add), "removeLabelIds": sorted(remove)},
        })
        _api(token, "/settings/filters/" + quote(str(item["id"]), safe=""), method="DELETE")
        return True
    action = {}
    if never_spam:
        action["removeLabelIds"] = ["SPAM"]
    if mark_important:
        action["addLabelIds"] = ["IMPORTANT"]
    _api(token, "/settings/filters", payload={"criteria": {"from": sender_email}, "action": action})
    return True


def _placement(metadata: dict) -> dict[str, str]:
    labels = set(metadata.get("labelIds", []))
    if "SPAM" in labels:
        placement = "Spam"
    elif "INBOX" in labels:
        placement = "Inbox"
    else:
        placement = "Other folder"
    tab = next((name for label, name in INBOX_TABS.items() if label in labels), "") if placement == "Inbox" else ""
    return {"placement": placement, "tab": tab, "labels": ",".join(sorted(labels)),
            "gmail_id": str(metadata.get("id", "")), "thread_id": str(metadata.get("threadId", ""))}


def _metadata(token: str, gmail_id: str) -> tuple[dict, dict[str, str]]:
    metadata = _api(token, "/messages/" + quote(gmail_id, safe=""),
                    query={"format": "metadata", "metadataHeaders": ["Message-ID", "From", "Subject"]})
    headers = {h.get("name", "").lower(): h.get("value", "")
               for h in metadata.get("payload", {}).get("headers", [])}
    return metadata, headers


def find_message_placement(token: str, rfc822_message_id: str, *, sender: str = "", subject: str = "",
                           sent_after: int = 0) -> dict[str, str]:
    """Read Gmail labels for one message without modifying it.

    Returns placement (Inbox, Spam, Other folder or Not found), the inbox tab,
    the label list and the Gmail ids needed to reply in the same thread.

    Some sending services (Amazon SES, Microsoft 365, some relays) replace the
    Message-ID we set, so when it isn't found, sender + exact subject + send time
    (a Unix timestamp) find the copy instead.
    """
    wanted = rfc822_message_id.strip().strip("<>")
    query = "in:anywhere rfc822msgid:<" + wanted + ">"
    listed = _api(token, "/messages", query={"q": query, "maxResults": "10", "includeSpamTrash": "true"})
    for item in listed.get("messages", []):
        metadata, headers = _metadata(token, str(item.get("id", "")))
        if headers.get("message-id", "").strip().strip("<>") == wanted:
            return _placement(metadata)
    if sender and subject and sent_after:
        # Gmail's after: takes seconds; a minute of slack covers clock skew between servers.
        query = f'in:anywhere from:{sender} after:{max(0, sent_after - 60)} subject:"{subject.replace(chr(34), "")}"'
        listed = _api(token, "/messages", query={"q": query, "maxResults": "10", "includeSpamTrash": "true"})
        for item in listed.get("messages", []):
            metadata, headers = _metadata(token, str(item.get("id", "")))
            if " ".join(headers.get("subject", "").split()) == " ".join(subject.split()) and \
                    sender.lower() in headers.get("from", "").lower():
                return _placement(metadata)
    return {"placement": "Not found", "tab": "", "labels": "", "gmail_id": "", "thread_id": ""}


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def send(account: str, token: str, recipient: str, subject: str, body: str,
         *, in_reply_to: str = "", thread_id: str = "", from_name: str = "") -> dict[str, str]:
    message = EmailMessage()
    message["From"] = f'"{from_name}" <{account}>' if from_name else account
    message["To"] = recipient
    message["Subject"] = subject
    message_id = make_msgid(domain=account.rsplit("@", 1)[-1])
    message["Message-ID"] = message_id
    if in_reply_to:
        reference = "<" + in_reply_to.strip().strip("<>") + ">"
        message["In-Reply-To"] = reference
        message["References"] = reference
    message.set_content(body)
    payload = {"raw": _b64url(message.as_bytes())}
    if thread_id:
        payload["threadId"] = thread_id
    result = _api(token, "/messages/send", payload=payload)
    return {"message_id": message_id.strip("<>"), "gmail_id": str(result.get("id", "")),
            "thread_id": str(result.get("threadId", ""))}



def _gmail_id(token: str, rfc822_message_id: str, gmail_id: str = "") -> str:
    if gmail_id:  # Saved by the last placement check, which may have needed the subject fallback.
        return gmail_id
    found = find_message_placement(token, rfc822_message_id)
    if not found["gmail_id"]:
        raise ValueError("The message was not found in this inbox")
    return found["gmail_id"]


def not_spam(token: str, rfc822_message_id: str, gmail_id: str = "") -> None:
    """Report not spam: remove the SPAM label and put the message in the Inbox."""
    _api(token, "/messages/" + quote(_gmail_id(token, rfc822_message_id, gmail_id), safe="") + "/modify",
         payload={"removeLabelIds": ["SPAM"], "addLabelIds": ["INBOX"]})


def mark_important(token: str, rfc822_message_id: str, gmail_id: str = "") -> None:
    _api(token, "/messages/" + quote(_gmail_id(token, rfc822_message_id, gmail_id), safe="") + "/modify",
         payload={"addLabelIds": ["IMPORTANT"]})
