"""Small Microsoft Graph client for Outlook.com and Microsoft 365 seed inboxes."""
from __future__ import annotations

import json
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

GRAPH = "https://graph.microsoft.com/v1.0/me"
# offline_access gives a refresh token; MailboxSettings.ReadWrite is needed for inbox rules.
SCOPES = "openid email offline_access User.Read Mail.ReadWrite Mail.Send MailboxSettings.ReadWrite"


def _login_url(tenant: str, path: str) -> str:
    return f"https://login.microsoftonline.com/{quote(tenant or 'common', safe='')}/oauth2/v2.0/{path}"


def _request(url: str, *, token: str | None = None, data: bytes | None = None, json_body: dict | None = None,
             method: str | None = None, timeout: int = 20) -> dict:
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    if json_body is not None:
        data = json.dumps(json_body).encode()
        headers["Content-Type"] = "application/json"
    elif data is not None:
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    request = Request(url, data=data, headers=headers, method=method or ("POST" if data is not None else "GET"))
    try:
        with urlopen(request, timeout=timeout) as response:
            body = response.read()
            return json.loads(body) if body else {}
    except HTTPError as exc:
        # Never include response bodies or tokens in application logs/errors.
        if exc.code == 403:
            raise PermissionError("Microsoft refused this request. The account may need to grant more access") from exc
        raise RuntimeError(f"Microsoft Graph request failed ({exc.code})") from exc
    except (URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise RuntimeError("Microsoft Graph request failed") from exc


def authorize_url(client: dict, redirect_uri: str, state: str, login_hint: str = "") -> str:
    params = {"client_id": client["id"], "response_type": "code", "redirect_uri": redirect_uri, "response_mode": "query",
              "scope": SCOPES, "state": state, "prompt": "select_account"}
    if login_hint:
        params["login_hint"] = login_hint
    return _login_url(client.get("tenant", "common"), "authorize") + "?" + urlencode(params)


def exchange_code(code: str, redirect_uri: str, client: dict) -> dict:
    data = urlencode({"client_id": client["id"], "client_secret": client["secret"], "code": code, "redirect_uri": redirect_uri,
                      "grant_type": "authorization_code", "scope": SCOPES}).encode()
    return _request(_login_url(client.get("tenant", "common"), "token"), data=data)


def refresh(refresh_token: str, client: dict) -> tuple[str, str]:
    """Return (access_token, refresh_token). Microsoft rotates refresh tokens, so save the new one."""
    if not client.get("id") or not client.get("secret"):
        raise RuntimeError("Microsoft sign-in is not configured")
    data = urlencode({"client_id": client["id"], "client_secret": client["secret"], "refresh_token": refresh_token,
                      "grant_type": "refresh_token", "scope": SCOPES}).encode()
    result = _request(_login_url(client.get("tenant", "common"), "token"), data=data)
    if not result.get("access_token"):
        raise RuntimeError("Microsoft could not refresh the mailbox connection")
    return result["access_token"], result.get("refresh_token") or refresh_token


def profile_email(token: str) -> str:
    me = _request(GRAPH + "?$select=mail,userPrincipalName", token=token)
    address = str(me.get("mail") or me.get("userPrincipalName") or "").strip().lower()
    if "@" not in address:
        raise RuntimeError("Microsoft did not return an email address")
    return address


def _folder_id(token: str, name: str) -> str:
    return str(_request(f"{GRAPH}/mailFolders/{name}?$select=id", token=token).get("id", ""))


def _find(token: str, rfc822_message_id: str) -> dict | None:
    wanted = "<" + rfc822_message_id.strip().strip("<>") + ">"
    query = urlencode({"$filter": f"internetMessageId eq '{wanted.replace(chr(39), chr(39) * 2)}'",
                       "$select": "id,parentFolderId,inferenceClassification,importance,conversationId,flag", "$top": "5"})
    found = _request(f"{GRAPH}/messages?{query}", token=token).get("value", [])
    return found[0] if found else None


def find_message_placement(token: str, rfc822_message_id: str) -> dict[str, str]:
    """Placement from the message's folder and Focused/Other classification. Read-only."""
    message = _find(token, rfc822_message_id)
    if not message:
        return {"placement": "Not found", "tab": "", "labels": "", "gmail_id": "", "thread_id": ""}
    folder = message.get("parentFolderId", "")
    if folder == _folder_id(token, "junkemail"):
        placement, tab = "Spam", ""
    elif folder == _folder_id(token, "inbox"):
        placement = "Inbox"
        tab = "Other" if str(message.get("inferenceClassification", "")).lower() == "other" else "Focused"
    else:
        placement, tab = "Other folder", ""
    labels = ["JUNK" if placement == "Spam" else placement.upper().replace(" ", "_")]
    if tab:
        labels.append(tab.upper())
    if message.get("importance") == "high":
        labels.append("IMPORTANT")
    if (message.get("flag") or {}).get("flagStatus") == "flagged":
        labels.append("FLAGGED")
    return {"placement": placement, "tab": tab, "labels": ",".join(labels),
            "gmail_id": str(message.get("id", "")), "thread_id": str(message.get("conversationId", ""))}


def not_junk(token: str, rfc822_message_id: str) -> None:
    """Mark as not junk: moves the message to the Inbox and unblocks the sender."""
    message = _find(token, rfc822_message_id)
    if not message:
        raise ValueError("The message was not found in this inbox")
    _request(f"{GRAPH}/messages/{quote(message['id'], safe='')}/markAsNotJunk", token=token, json_body={"moveToInbox": True})


def mark_important(token: str, rfc822_message_id: str) -> None:
    message = _find(token, rfc822_message_id)
    if not message:
        raise ValueError("The message was not found in this inbox")
    _request(f"{GRAPH}/messages/{quote(message['id'], safe='')}", token=token, json_body={"importance": "high"}, method="PATCH")


def reply(token: str, rfc822_message_id: str, body: str) -> dict[str, str]:
    """Reply to the original message in the same conversation."""
    message = _find(token, rfc822_message_id)
    if not message:
        raise ValueError("The original email was not found in this inbox, so a threaded reply isn't possible yet")
    # createReply keeps the conversation; the plain-text body replaces the quoted HTML draft.
    draft = _request(f"{GRAPH}/messages/{quote(message['id'], safe='')}/createReply", token=token, json_body={})
    draft_id = quote(str(draft["id"]), safe="")
    _request(f"{GRAPH}/messages/{draft_id}", token=token, method="PATCH",
             json_body={"body": {"contentType": "Text", "content": body}})
    _request(f"{GRAPH}/messages/{draft_id}/send", token=token, json_body={})
    return {"message_id": str(draft.get("internetMessageId", "")).strip("<>"), "gmail_id": "",
            "thread_id": str(message.get("conversationId", ""))}


RULE_NAME = "Mail Mantis: {sender} is important"


def filter_status(token: str, sender_email: str) -> dict[str, bool]:
    """Always Focused = an inference override for the sender; Important = an inbox rule marking it high importance."""
    overrides = _request(f"{GRAPH}/inferenceClassification/overrides", token=token).get("value", [])
    focused = any(str((o.get("senderEmailAddress") or {}).get("address", "")).lower() == sender_email.lower()
                  and o.get("classifyAs") == "focused" for o in overrides)
    rules = _request(f"{GRAPH}/mailFolders/inbox/messageRules", token=token).get("value", [])
    important = any(rule.get("isEnabled") and (rule.get("actions") or {}).get("markImportance") == "high"
                    and any(str((a.get("emailAddress") or {}).get("address", "")).lower() == sender_email.lower()
                            for a in (rule.get("conditions") or {}).get("fromAddresses", []) or [])
                    for rule in rules)
    return {"never_spam": focused, "important": important}


def create_filter(token: str, sender_email: str, *, focused: bool = False, important: bool = False) -> bool:
    status = filter_status(token, sender_email)
    changed = False
    if focused and not status["never_spam"]:
        overrides = _request(f"{GRAPH}/inferenceClassification/overrides", token=token).get("value", [])
        existing = next((o for o in overrides if str((o.get("senderEmailAddress") or {}).get("address", "")).lower()
                         == sender_email.lower()), None)
        if existing:  # An "always Other" override for this sender: switch it to Focused.
            _request(f"{GRAPH}/inferenceClassification/overrides/{quote(str(existing['id']), safe='')}", token=token,
                     json_body={"classifyAs": "focused"}, method="PATCH")
        else:
            _request(f"{GRAPH}/inferenceClassification/overrides", token=token,
                     json_body={"classifyAs": "focused", "senderEmailAddress": {"address": sender_email}})
        changed = True
    if important and not status["important"]:
        _request(f"{GRAPH}/mailFolders/inbox/messageRules", token=token, json_body={
            "displayName": RULE_NAME.format(sender=sender_email), "sequence": 1, "isEnabled": True,
            "conditions": {"fromAddresses": [{"emailAddress": {"address": sender_email}}]},
            "actions": {"markImportance": "high"}})
        changed = True
    return changed
