"""Claude and OpenAI-compatible (OpenAI, OpenRouter, Groq, Cloudflare) clients for briefs and drafts.

Gemini lives in api/app.py. Every client takes a prompt that asks for JSON and
returns (data, sources): the parsed JSON object and any URLs the model read.
"""
from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request

import anthropic


class AIError(ValueError):
    """A provider failure with a kind: key, model, quota, rate or other."""

    def __init__(self, message: str, kind: str = "other"):
        super().__init__(message)
        self.kind = kind


def parse_json(text: str, *, research: bool = False) -> dict:
    """Pull the JSON object out of a model's text answer (fenced, prefixed or bare)."""
    text = (text or "").strip()
    if text.startswith("```"):
        text = text.strip("`").removeprefix("json").strip()
    if not text.startswith("{"):
        match = re.search(r"\{.*\}", text, re.S)
        text = match.group(0) if match else text
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass
    if research and text:
        return {"summary": text}  # A research answer that ignored the JSON instruction is still a brief.
    raise ValueError("The model returned an unexpected response. Try again")


# ---------------------------------------------------------------- Claude

def _json_schema(gemini_schema: dict) -> dict:
    """Convert the Gemini-style schemas in api/app.py to JSON Schema for structured outputs."""
    out = {"type": gemini_schema["type"].lower()}
    if "properties" in gemini_schema:
        out["properties"] = {k: _json_schema(v) for k, v in gemini_schema["properties"].items()}
        out["required"] = list(gemini_schema.get("required", gemini_schema["properties"]))
        out["additionalProperties"] = False
    if "items" in gemini_schema:
        out["items"] = _json_schema(gemini_schema["items"])
    return out


def _claude_error(exc: Exception, model: str) -> AIError:
    message = str(getattr(exc, "message", "") or exc)
    print(f"Claude error {type(exc).__name__} model={model}: {message[:200]}", flush=True)
    if isinstance(exc, anthropic.AuthenticationError):
        return AIError("Claude rejected the API key. Check it in Settings", "key")
    if isinstance(exc, anthropic.PermissionDeniedError):
        return AIError(f"This Anthropic key can’t use {model}. Try another model in Settings", "model")
    if isinstance(exc, anthropic.NotFoundError):
        return AIError(f"Claude doesn’t recognise the model “{model}”. Check it in Settings", "model")
    if isinstance(exc, anthropic.RateLimitError):
        return AIError("Claude’s rate limit was reached. Wait a minute and try again", "rate")
    if isinstance(exc, anthropic.BadRequestError) and "credit" in message.lower():
        return AIError("Your Anthropic account has no API credit. Add credit at console.anthropic.com (a Claude Pro plan doesn’t include API use)", "quota")
    if isinstance(exc, anthropic.APIStatusError) and exc.status_code >= 500:
        return AIError("Claude is busy right now. Try again in a minute", "rate")
    if isinstance(exc, anthropic.APIConnectionError):
        return AIError("Could not reach Claude. Try again")
    return AIError("Claude could not complete this request" + (f": {' '.join(message.split())[:160]}" if message else ""))


def claude_request(api_key: str, model: str, prompt: str, *, schema_def: dict | None = None,
                   research: bool = False) -> tuple[dict, list[str]]:
    """research=True gives Claude web fetch and web search so it can read the business website itself."""
    client = anthropic.Anthropic(api_key=api_key, timeout=180, max_retries=1)
    params: dict = {"model": model, "max_tokens": 16000, "betas": ["server-side-fallback-2026-07-01"], "fallbacks": "default"}
    if research:
        # The dynamic-filtering tool versions need a 4.6+ Opus or Sonnet; Haiku gets the basic ones.
        basic = "haiku" in model
        params["tools"] = [
            {"type": "web_fetch_20250910" if basic else "web_fetch_20260209", "name": "web_fetch", "max_uses": 5},
            {"type": "web_search_20250305" if basic else "web_search_20260209", "name": "web_search", "max_uses": 3},
        ]
        params["output_config"] = {"effort": "medium"}
    else:
        params["output_config"] = {"effort": "low"}
        if schema_def:
            params["output_config"]["format"] = {"type": "json_schema", "schema": _json_schema(schema_def)}
    turn: list = []
    try:
        for _ in range(4):
            messages = [{"role": "user", "content": prompt}] + ([{"role": "assistant", "content": turn}] if turn else [])
            response = client.beta.messages.create(messages=messages, **params)
            turn += list(response.content)
            if response.stop_reason != "pause_turn":
                break
            # Server tools hit their iteration limit; sending the turn back makes Claude resume it.
    except anthropic.APIError as exc:
        raise _claude_error(exc, model) from None
    if response.stop_reason == "refusal":
        raise AIError("Claude declined this request. Try again or use another model")
    if response.stop_reason == "max_tokens":
        raise AIError("Claude ran out of output space. Try again")
    content = [block.to_dict() for block in turn]
    text ="".join(block.get("text", "") for block in content if block.get("type") == "text")
    sources = []
    for block in content:
        if block.get("type") == "web_fetch_tool_result":
            url = (block.get("content") or {}).get("url", "")
            if url and url not in sources:
                sources.append(url)
    return parse_json(text, research=research), sources


# ---------------------------------------------------------------- OpenAI-compatible chat APIs

CHAT_BASES = {
    "openai": "https://api.openai.com/v1",
    "openrouter": "https://openrouter.ai/api/v1",
    "groq": "https://api.groq.com/openai/v1",
    "cloudflare": "https://api.cloudflare.com/client/v4/accounts/{account}/ai/v1",
}
LABELS = {"openai": "OpenAI", "openrouter": "OpenRouter", "groq": "Groq", "cloudflare": "Cloudflare Workers AI"}
# Groq and Cloudflare sit behind Cloudflare's bot filter, which answers Python's default
# User-Agent with a 403 (error 1010) before the API ever sees the key.
USER_AGENT = "MailMantis/1.0"


def _chat_error(exc: urllib.error.HTTPError, provider: str, model: str) -> AIError:
    label = LABELS[provider]
    try:
        raw = exc.read() or b"{}"
        data = json.loads(raw)
    except (ValueError, OSError):
        data = None  # An HTML page: a proxy or bot filter answered, not the API.
    error = (data or {}).get("error", {}) or {}
    if not error and isinstance(data, dict) and data.get("errors"):
        error = data["errors"][0]  # Cloudflare's API wraps errors in a list.
    message = str(error.get("message", "") if isinstance(error, dict) else error)
    code = str(error.get("code", "") if isinstance(error, dict) else "")
    print(f"{label} error {exc.code} model={model} code={code}: {message[:200]}", flush=True)
    lower = message.lower()
    if exc.code == 401 or (provider == "cloudflare" and exc.code == 403 and "auth" in lower):
        hint = " It needs the Workers AI Read permission." if provider == "cloudflare" else ""
        return AIError(f"{label} rejected the API key.{hint} Check it in Settings", "key")
    if exc.code == 404 or code in ("model_not_found", "5007") or "no such model" in lower:
        if provider == "cloudflare" and "model" not in lower:
            return AIError("Cloudflare doesn’t recognise this account ID. Check it in Settings", "key")
        return AIError(f"{label} doesn’t recognise the model “{model}”. Check it in Settings", "model")
    if exc.code == 402 or code in ("insufficient_quota", "4006") or "neurons" in lower:
        return AIError(f"Your {label} account has no credit left for {model}. Add credit, wait for the daily free allowance to reset, or pick a free model", "quota")
    if exc.code == 429:
        return AIError(f"{label}’s rate limit for {model} was reached. Wait a minute, or try another model", "rate")
    if exc.code == 403:
        if data is None:
            return AIError(f"{label} blocked the request before checking the key. Try again in a minute", "other")
        detail = f": {' '.join(message.split())[:160]}" if message else ""
        if provider == "groq":
            return AIError(f"Groq doesn’t allow this key to use {model}{detail}. Check the model is allowed in your Groq project’s settings, or try llama-3.3-70b-versatile", "model")
        return AIError(f"{label} doesn’t allow this key to use {model}{detail}", "model")
    detail = " ".join(message.split())[:160]
    return AIError(f"{label} could not complete this request" + (f": {detail}" if detail else ""))


def chat_request(provider: str, api_key: str, model: str, prompt: str, *, research: bool = False,
                 account: str = "") -> tuple[dict, list[str]]:
    """These APIs can't open websites, so briefs rely on the page text our server fetched.

    account is the Cloudflare account ID, which is part of the Workers AI URL.
    """
    payload: dict = {"model": model, "messages": [{"role": "user", "content": prompt}]}
    if provider in ("openai", "groq"):
        # Not every free OpenRouter model or Workers AI model supports it; the prompt asks for JSON anyway.
        payload["response_format"] = {"type": "json_object"}
    if provider == "cloudflare":
        payload["max_tokens"] = 4096  # Workers AI defaults to 256 output tokens, too few for a batch of emails.
    headers = {"Content-Type": "application/json", "Authorization": "Bearer " + api_key, "User-Agent": USER_AGENT}
    if provider == "openrouter":
        headers["X-Title"] = "Mail Mantis"
    base = CHAT_BASES[provider].format(account=urllib.parse.quote(account, safe=""))
    request = urllib.request.Request(base + "/chat/completions", data=json.dumps(payload).encode(),
                                     headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            result = json.loads(response.read())
    except urllib.error.HTTPError as exc:
        raise _chat_error(exc, provider, model) from None
    except (OSError, TimeoutError, json.JSONDecodeError):
        raise AIError(f"Could not get a response from {LABELS[provider]}. Try again") from None
    try:
        choice = result["choices"][0]
        text = choice["message"].get("content") or ""
    except (KeyError, IndexError, TypeError, AttributeError):
        raise AIError(f"{LABELS[provider]} returned an unexpected response. Try again") from None
    if not text.strip() and choice.get("finish_reason") == "length":
        raise AIError(f"{LABELS[provider]} ran out of output space. Try again")
    return parse_json(text, research=research), []
