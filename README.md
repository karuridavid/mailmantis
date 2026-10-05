# Mail Mantis

**Know where your domain’s email lands.**

Mail Mantis is a small, self-hosted dashboard for warming up and monitoring a custom domain with inboxes you own: Gmail and Google Workspace, Outlook and Microsoft 365, Yahoo, iCloud, AOL or any IMAP inbox. Draft ordinary emails with AI (Gemini, Claude, OpenAI, OpenRouter, Groq or Cloudflare Workers AI, or any chat app by copy and paste), send them yourself, see whether they landed in the inbox, a tab or spam, and reply from the same place.

It is manual by default:
- **Sending:** nothing is sent until you press Send, unless you turn on autopilot.
- **Replies:** seed inboxes only reply when you send a reply or autopilot is on.
- **Placement checks:** these only read Gmail labels. Messages are never moved.

![Mail Mantis overview](site/assets/shots/overview-light.jpg)

## Quick start

```sh
git clone https://github.com/karuridavid/mailmantis
cd mailmantis
docker compose up -d
docker compose logs app | grep "setup key"
```

Open http://localhost:8080, enter the one-time setup key, and create your admin login. The Overview page walks you through the rest:
1. Domain sender
2. Business brief
3. AI model
4. Google sign-in
5. Seed inboxes
6. First email

For a public HTTPS domain, set `DOMAIN` and `TRUST_PROXY=1` in `.env` and run `docker compose --profile https up -d`. Caddy then handles the certificate.

The full guide covers Google OAuth setup, HTTPS, Vercel + Neon, and configuration. It is on the project site at [mailmantis.org/self-host](https://mailmantis.org/self-host).

## How it works

1. **Connect** your domain's SMTP sender and the Gmail or Workspace inboxes you own (Google sign-in). You can save several sender domains; one is active (being warmed) at a time, and the dashboard shows that domain's results.
2. **Brief:** AI reads your public website and drafts a summary of the business. You correct it, or write it yourself.
3. **Draft and send:** AI writes a different, ordinary email for each inbox. You pick the model each time. You edit each one, mark it ready, and send it.
4. **Placement:** the app finds the exact `Message-ID` in the seed inbox and reads its labels. It reports Inbox (and the tab), Spam, Other folder, or Not found yet.
5. **Reply:** reply from the seed inbox, in the same thread. Once the seed has replied, the domain can answer back, and the conversation can go back and forth. You write each reply or have AI draft it from the conversation so far.

When you choose, you can also act on a sent email: move it out of spam, or mark it important. These actions are not automatic.

### Autopilot

Turn it on from the Overview page and it runs once a day until you pause it. Each run first replies once in each of its open conversations: the seed replies, then your domain, then the seed again. Then it writes and sends new emails (1 to 10 a day) to the seed inboxes that have waited longest. It writes with your default AI service and can move its own emails out of spam before replying. **Run now** does today's run straight away.

- **Vercel:** set a `CRON_SECRET` environment variable (any long random string) and redeploy. `vercel.json` schedules `/api/cron` at 09:00 UTC.
- **Docker / `server.py`:** the server runs it itself, from 09:00 UTC.

| Inbox | Connects with | Not spam | Important | Filters |
| --- | --- | --- | --- | --- |
| Gmail / Workspace | Google sign-in | Remove `SPAM` label | `IMPORTANT` label | Never send to Spam (also marks important) |
| Outlook / Microsoft 365 | Microsoft sign-in | Graph `markAsNotJunk` | High importance | Always Focused (also adds the Mark important rule) |
| Yahoo, iCloud, AOL, IMAP | App password | Move to INBOX | `\Flagged` | Not available over IMAP |

## AI models

Settings → **AI writing** takes a key for any of these. Each draft, reply and brief has a picker, so you can try several.

| Service | Cost | Reads the website itself |
| --- | --- | --- |
| Google Gemini | Free tier | Yes (URL context and Google Search) |
| Anthropic Claude | Paid API credit | Yes (web fetch and web search) |
| OpenAI | Paid API credit | No, uses the page text the server fetched |
| OpenRouter | Free models (`:free`, `openrouter/free`) | No |
| Groq | Free tier | No |
| Cloudflare Workers AI | Free daily allowance (needs your account ID and a Workers AI API token) | No |

A Claude Pro or ChatGPT Plus plan doesn't include API use. To use one anyway, pick **Chat app**: Mail Mantis gives you the prompt, you paste it into the chat app and paste the answer back.

## People

Invite people under **People** to lend their inboxes. Member accounts can only connect, manage and disconnect their own Gmail or Outlook inboxes. Settings → **Check connection** validates the Google and Microsoft app keys without signing anyone in.

## Project layout

| Path | What it is |
| --- | --- |
| `index.html`, `app.js`, `app.css`, `assets/` | Dashboard (plain HTML/CSS/JS, no build step) |
| `api/app.py` | API: one `POST /api/app` endpoint dispatching on `action`, plus the Google OAuth callback |
| `gmail_api.py`, `microsoft_api.py`, `imap_box.py` | Mailbox clients for Gmail, Microsoft Graph and IMAP |
| `site_reader.py` | Reads a business website's text for the AI brief |
| `ai_clients.py` | Claude and OpenAI-compatible (OpenAI, OpenRouter, Groq, Cloudflare) clients; Gemini is in `api/app.py` |
| `oauth_check.py` | Validates Google and Microsoft app keys |
| `server.py` | Standalone server used by Docker; serves the dashboard and API |
| `site/` | Public project website (static) |
| `tests/` | Fake-services server, demo data and end-to-end API tests |

## Development

```sh
docker run -d --name ms-test-db -e POSTGRES_PASSWORD=dev -p 55432:5432 postgres:16-alpine
pip install -r requirements.txt
DEMO=1 python tests/fake_server.py      # http://localhost:18080 — demo@example.com / demo-password-123
```

`tests/fake_server.py` replaces Gmail, Microsoft Graph, SMTP and the AI services with fakes. Against an empty database (and a [GreenMail](https://greenmail-mail-test.github.io/greenmail/) container for IMAP, see `tests/test_imap_box.py`), run `python tests/test_api.py` for the end-to-end API tests. `tests/test_clients.py` and `tests/test_imap_box.py` test the mailbox clients.

## Responsible use

Mail Mantis is for your own domains and inboxes you own. It sends one email at a time and has no lists, imports or campaigns. It can't guarantee inbox placement. SPF, DKIM, DMARC and real engagement matter far more.

## License

[MIT](LICENSE). Bundled fonts: Geist and Geist Mono, under the SIL Open Font License (`assets/fonts/OFL-Geist.txt`).
