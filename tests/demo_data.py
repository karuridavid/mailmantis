"""Sample data for screenshots and UI work. Fictional business, fictional inboxes."""
import json
import random
import secrets
from datetime import datetime, timedelta, timezone

SENDER = "hello@fernhillpottery.com"
BRIEF = ("Fernhill Pottery is a small studio in Bristol making small-batch stoneware: mugs, bowls and serving plates "
         "glazed in-house. They sell online and at a monthly studio open day, and run weekend wheel-throwing classes "
         "for beginners. The tone is warm, unhurried and practical.")
SEEDS = [("Jane", "jane.cooper.mail@gmail.com", "gmail", True, True, False),
         ("Marcus", "marcus.hale@gmail.com", "gmail", True, False, False),
         ("Priya", "priya@northwind-studio.co", "workspace", True, True, True),
         ("Tom", "tom.reyes.inbox@gmail.com", "gmail", False, None, None),
         ("Elena", "elena.v.mail@gmail.com", "gmail", True, False, False),
         ("Sam", "sam.taylor.mail@outlook.com", "outlook", True, True, False),
         ("Riley", "riley.brooks@yahoo.com", "yahoo", True, None, None)]
EMAILS = [
    ("Your class spot for Saturday", "Hi {n},\n\nJust a note that your place on Saturday's beginners' wheel class is confirmed. We start at 10am and finish around 1pm, with tea halfway through.\n\nWear something you don't mind getting clay on. Aprons are provided.\n\nSee you then,\nFernhill Pottery"),
    ("New speckled mugs are out of the kiln", "Hi {n},\n\nThe latest batch of speckled oatmeal mugs came out of the kiln this week, and they've turned out lovely. There are about thirty, each slightly different.\n\nThey'll be on the shelves at the open day first. Would you like us to keep one aside for you?\n\nFernhill Pottery"),
    ("A quick thank-you", "Hi {n},\n\nThank you for your order last week. We hope the bowls arrived safely and are already getting some use.\n\nIf anything wasn't quite right, just reply and let us know.\n\nWarmly,\nFernhill Pottery"),
    ("Studio open day this Sunday", "Hi {n},\n\nOur monthly open day is this Sunday from 11 until 4. You're welcome to come and see the wheels, browse seconds and chat about glazes.\n\nNo need to book. Just drop in.\n\nFernhill Pottery"),
    ("Caring for your stoneware", "Hi {n},\n\nA small tip we get asked about: our stoneware is dishwasher safe, but hand-washing keeps the glaze looking its best for longer. Avoid moving pieces straight from the fridge into a hot oven.\n\nAny questions, just ask.\n\nFernhill Pottery"),
    ("How was the class?", "Hi {n},\n\nWe hope you enjoyed the wheel class. Your pieces are drying now and will be bisque fired next week.\n\nWe'd love to hear how you found it. Was the pace right for you?\n\nFernhill Pottery"),
    ("Your bowls are ready to collect", "Hi {n},\n\nGood news: the glazed bowls from your class are out of the final firing and ready to collect from the studio any weekday between 10 and 5.\n\nFernhill Pottery"),
]
REPLIES = ["Thanks so much! Looking forward to it.", "Lovely, yes please. Could you keep a blue one aside?",
           "They arrived safely and look beautiful. Thank you!", "I'll try to pop in on Sunday afternoon.",
           "That's really useful, thanks for the tip."]


def load_demo(app, placements):
    random.seed(7)
    now = datetime.now(timezone.utc)
    conn = app.db()
    app.schema(conn)
    with conn.cursor() as cur:
        for table in ("activity", "qa_drafts", "seed_accounts", "senders", "sender_settings", "app_settings", "sessions", "admins"):
            cur.execute(f"DELETE FROM {table}")
        cur.execute("INSERT INTO admins(email,password_hash) VALUES(%s,%s)", ("demo@example.com", app.password_hash("demo-password-123")))
        cur.execute("INSERT INTO senders(id,email,domain,smtp_host,smtp_port,password_enc,smtp_username,from_name,verified_at,active,brief,brief_sources,brief_updated,created_at) "
                    "VALUES(%s,%s,%s,%s,587,%s,%s,%s,%s,TRUE,%s,%s,%s,%s)",
                    (secrets.token_hex(16), SENDER, "fernhillpottery.com", "smtp-relay.brevo.com", app.seal("demo"), "8a1b2c001@smtp-brevo.com",
                     "Fernhill Pottery", now - timedelta(days=12), BRIEF, json.dumps(["https://fernhillpottery.com"]), now - timedelta(days=12), now - timedelta(days=14)))
        cur.execute("INSERT INTO senders(id,email,domain,smtp_host,smtp_port,password_enc,smtp_username,from_name,verified_at,active,created_at) "
                    "VALUES(%s,%s,%s,%s,587,%s,%s,%s,%s,FALSE,%s)",
                    (secrets.token_hex(16), "studio@fernhillclasses.com", "fernhillclasses.com", "smtp-relay.brevo.com", app.seal("demo"),
                     "8a1b2c002@smtp-brevo.com", "Fernhill Classes", now - timedelta(days=2), now - timedelta(days=2)))
        cur.execute("INSERT INTO app_settings(name,value) VALUES('senders_migrated','1')")
        for name, value in {"ai_provider": "gemini",
                            "ai_model": "gemini-3.8-flash", "ai_key_enc": app.seal("demo"), "ai_key_enc:claude": app.seal("demo"), "ai_model:claude": "claude-opus-5-5",
                            "google_client_id": "1234567890-demo.apps.googleusercontent.com",
                            "google_client_secret_enc": app.seal("demo")}.items():
            cur.execute("INSERT INTO app_settings(name,value) VALUES(%s,%s)", (name, value))
        for i, (name, email, provider, can_send, never_spam, important) in enumerate(SEEDS):
            auth = {"outlook": "microsoft_oauth", "yahoo": "app_password"}.get(provider, "google_oauth")
            cur.execute("INSERT INTO seed_accounts(id,name,email,provider,password_enc,auth_type,oauth_refresh_enc,gmail_send_enabled,enabled,filter_never_spam,filter_important,filters_checked_at,created_at) "
                        "VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                        (secrets.token_hex(16), name, email, provider, app.seal("demo") if auth == "app_password" else "", auth,
                         app.seal("demo") if auth != "app_password" else "", can_send, name != "Tom", never_spam, important,
                         now - timedelta(hours=5) if never_spam is not None else None, now - timedelta(days=14, minutes=i)))

        def draft(kind, seed, subject, body, status, created, sent=None, placement="", tab="", parent=""):
            draft_id = secrets.token_hex(16)
            frm, to = (SENDER, seed[1]) if kind == "domain" else (seed[1], SENDER)
            message_id = f"{draft_id[:12]}@fernhillpottery.com" if sent else ""
            inbox_labels = ("INBOX," + tab.upper() if tab in ("Focused", "Other") else "INBOX" if not tab and seed[2] == "yahoo"
                            else "INBOX," + ("CATEGORY_" + tab.upper() if tab and tab != "Primary" else "CATEGORY_PERSONAL"))
            labels = {"Inbox": inbox_labels, "Spam": "BULK" if seed[2] == "yahoo" else "JUNK" if seed[2] == "outlook" else "SPAM"}.get(placement, "")
            cur.execute("INSERT INTO qa_drafts(id,kind,parent_id,seed_email,from_email,to_email,subject,body,status,message_id,sent_at,placement,inbox_tab,gmail_labels,checked_at,created_at,updated_at) "
                        "VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                        (draft_id, kind, parent, seed[1], frm, to, subject, body, status, message_id, sent, placement, tab,
                         labels if kind == "domain" else "", sent + timedelta(minutes=2) if placement else None, created, sent or created))
            if placement and kind == "domain":
                for delay, result in ([(1, "Not found")] if random.random() < .3 else []) + [(2, placement)]:
                    cur.execute("INSERT INTO activity(id,seed_email,result,tab,duration_ms,message_id,draft_id,created_at) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)",
                                (secrets.token_hex(16), seed[1], result, tab if result == "Inbox" else "", random.randint(600, 1900), message_id, draft_id, sent + timedelta(minutes=delay)))
            return draft_id

        active = [s for s in SEEDS if s[0] != "Tom"]
        for day in range(13, 0, -1):
            for seed in random.sample(active, random.choice([0, 1, 1, 2, 2, 3])):
                subject, body = random.choice(EMAILS)
                sent = now - timedelta(days=day, hours=random.randint(0, 8), minutes=random.randint(0, 59))
                roll = random.random()
                placement, tab = ("Spam", "") if (seed[0] == "Marcus" and roll < .35) or roll < .05 else \
                    ("Inbox", "Promotions") if roll < .2 else ("Inbox", "Updates") if roll < .25 else ("Inbox", "Primary")
                if seed[2] == "outlook" and placement == "Inbox":
                    tab = "Focused" if tab == "Primary" else "Other"
                elif seed[2] == "yahoo":
                    tab = ""
                parent = draft("domain", seed, subject, body.format(n=seed[0]), "sent", sent - timedelta(minutes=20), sent, placement, tab)
                if placement == "Inbox" and random.random() < .45:
                    draft("reply", seed, "Re: " + subject, random.choice(REPLIES) + "\n\n" + seed[0], "sent", sent + timedelta(hours=2),
                          sent + timedelta(hours=3), parent=parent)
        jane, priya, elena, marcus = active[0], active[2], active[3], active[1]
        sent = now - timedelta(minutes=4)
        draft("domain", priya, "Kiln week: a quick update", "Hi Priya,\n\nWe're firing the big kiln this week, so the studio will be a little quieter than usual. Orders placed before Thursday will still go out on Friday.\n\nFernhill Pottery", "sent", sent - timedelta(minutes=10), sent)
        draft("domain", jane, "Glaze colours for spring", "Hi Jane,\n\nWe're testing a few new glazes for spring: a soft sage, a deep ink blue and a warm honey. We'd love your opinion on which one should make it onto the mugs.\n\nWhich would you pick?\n\nFernhill Pottery", "ready", now - timedelta(minutes=40))
        draft("domain", elena, "Seconds shelf restocked", "Hi Elena,\n\nThe seconds shelf has been restocked with bowls and side plates that have small glaze marks but are perfectly usable.\n\nThey're half price at Sunday's open day.\n\nFernhill Pottery", "ready", now - timedelta(minutes=38))
        draft("domain", marcus, "A note about your order", "Hi Marcus,\n\nThanks for your order. Your serving plate is being packed this afternoon and should reach you early next week.\n\nFernhill Pottery", "draft", now - timedelta(minutes=35))
        last = draft("domain", jane, "Thank you for coming on Saturday", "Hi Jane,\n\nThank you for coming to Saturday's class. You picked up centring really quickly.\n\nYour mug and bowl are drying now and will be fired next week. We'll let you know when they're ready.\n\nFernhill Pottery",
                     "sent", now - timedelta(hours=26), now - timedelta(hours=25), "Inbox", "Primary")
        draft("reply", jane, "Re: Thank you for coming on Saturday", "Thank you! I had such a good time. Can't wait to see how the bowl turns out.\n\nJane", "draft", now - timedelta(minutes=20), parent=last)
    conn.commit()
    conn.close()
