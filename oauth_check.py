"""Check Google and Microsoft OAuth app settings without signing anyone in.

Both providers check the app's credentials before looking at the authorization
code, so redeeming a dummy code tells us whether the client ID and secret are
right. Google's authorize endpoint also reports an unregistered redirect URI.
"""
from __future__ import annotations

import base64
import json
import re
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

# A code with a realistic shape: Microsoft rejects obviously malformed codes before checking the app.
DUMMY_CODE = "M.C507_BAY.2.U." + "0" * 96


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def _call(url: str, form: dict | None = None) -> tuple[int, dict, str]:
    """(status, JSON body or {}, Location header)."""
    data = urlencode(form).encode() if form else None
    request = Request(url, data=data, headers={"User-Agent": "MailMantis/1.0 (configuration check)", "Accept": "application/json"})
    try:
        response = build_opener(_NoRedirect).open(request, timeout=12)
        status, body, location = response.status, response.read(), response.headers.get("Location", "")
    except HTTPError as exc:
        status, body, location = exc.code, exc.read() or b"", exc.headers.get("Location", "")
    except (URLError, TimeoutError, OSError):
        return 0, {}, ""
    try:
        parsed = json.loads(body) if body[:1] == b"{" else {}
    except ValueError:
        parsed = {}
    return status, parsed, location


def _result(label: str, ok: bool | None, detail: str) -> dict:
    return {"label": label, "ok": ok, "detail": detail}


def check_google(client_id: str, secret: str, redirect_uri: str) -> list[dict]:
    results = []
    status, body, _ = _call("https://oauth2.googleapis.com/token", {
        "client_id": client_id, "client_secret": secret, "code": "mailmantis-check", "grant_type": "authorization_code",
        "redirect_uri": redirect_uri})
    error = body.get("error", "")
    if status == 0:
        results.append(_result("Client ID and secret", None, "Couldn't reach Google. Try again"))
    elif error == "invalid_grant":
        results.append(_result("Client ID and secret", True, "Google accepted the client ID and secret"))
    elif error in ("invalid_client", "unauthorized_client"):
        results.append(_result("Client ID and secret", False, (body.get("error_description") or "Google rejected them").rstrip(".")
                               + ". Copy both again from Google Cloud → Clients"))
    else:
        results.append(_result("Client ID and secret", None, f"Google answered “{error or status}”, which doesn't confirm either way"))

    if error in ("invalid_client", "unauthorized_client"):
        results.append(_result("Redirect URI", None, "Checked once the client ID is right"))
        return results
    _, _, location = _call("https://accounts.google.com/o/oauth2/v2/auth?" + urlencode({
        "client_id": client_id, "redirect_uri": redirect_uri, "response_type": "code",
        "scope": "openid email https://www.googleapis.com/auth/gmail.modify"}))
    auth_error = parse_qs(urlparse(location).query).get("authError", [""])[0]
    if auth_error:
        try:  # authError is a small protobuf; its readable strings are the error code and message.
            decoded = base64.urlsafe_b64decode(auth_error + "=" * (-len(auth_error) % 4))
            words = " ".join(part.decode() for part in re.findall(rb"[\x20-\x7e]{4,}", decoded))
        except ValueError:
            words = ""
        if "redirect_uri_mismatch" in words:
            results.append(_result("Redirect URI", False, f"Not registered. Add {redirect_uri} under Authorized redirect URIs"))
        else:
            results.append(_result("Redirect URI", False, f"Google refused the sign-in request ({words or 'unknown error'})"))
    elif location:
        results.append(_result("Redirect URI", True, f"{redirect_uri} is registered"))
    else:
        results.append(_result("Redirect URI", None, "Couldn't reach Google's sign-in page. Try again"))
    return results


def _microsoft_token(tenant: str, client_id: str, secret: str, redirect_uri: str) -> tuple[int, dict]:
    status, body, _ = _call(f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token", {
        "client_id": client_id, "client_secret": secret, "code": DUMMY_CODE, "grant_type": "authorization_code",
        "redirect_uri": redirect_uri, "scope": "offline_access User.Read"})
    return status, body


def check_microsoft(client_id: str, secret: str, redirect_uri: str, tenant: str = "common") -> list[dict]:
    results = []
    status, body = _microsoft_token(tenant or "common", client_id, secret, redirect_uri)
    codes = set(body.get("error_codes") or [])
    if status == 0:
        results.append(_result("Application ID and secret", None, "Couldn't reach Microsoft. Try again"))
    elif 700016 in codes:
        results.append(_result("Application ID and secret", False, "Microsoft can't find this Application (client) ID. Check the ID, and that the app allows accounts in any organization and personal accounts"))
    elif codes & {7000215, 7000216}:
        results.append(_result("Application ID and secret", False, "The client secret is wrong. Use the secret's Value, not its Secret ID"))
    elif 7000222 in codes:
        results.append(_result("Application ID and secret", False, "The client secret has expired. Create a new one in Certificates & secrets"))
    elif codes & {50194, 700054}:
        results.append(_result("Application ID and secret", False, "The app is limited to one organization. Set supported account types to any organization and personal accounts"))
    elif body.get("error") == "invalid_grant":
        results.append(_result("Application ID and secret", True, "Microsoft accepted the application ID and secret"))
    else:
        results.append(_result("Application ID and secret", None, f"Microsoft answered “{body.get('error') or status}” {sorted(codes) or ''}, which doesn't confirm either way"))

    if results[0]["ok"]:
        _, personal = _microsoft_token("consumers", client_id, secret, redirect_uri)
        if 700016 in set(personal.get("error_codes") or []):
            results.append(_result("Outlook.com accounts", False, "Personal Microsoft accounts aren't enabled. Under Authentication, allow personal Microsoft accounts"))
        else:
            results.append(_result("Outlook.com accounts", True, "Personal and work accounts can sign in"))
    results.append(_result("Redirect URI", None, f"Microsoft only checks this at sign-in. If you see AADSTS50011, add {redirect_uri} as a Web redirect URI"))
    return results
