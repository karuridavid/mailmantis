"""Daily autopilot run, called by Vercel Cron (see vercel.json)."""
from api.app import handler as AppHandler


class handler(AppHandler):
    pass
