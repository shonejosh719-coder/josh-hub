# JOSH HUB 4.0 — ADMIN HQ

JOSH HUB ONLINE with the full personal dashboard plus an expanded owner/admin control centre.

## Owner
The username `josh` is permanently the JOSH HUB owner/admin. The owner cannot be demoted, banned, renamed, or deleted.

## Admin HQ
- Dashboard stats: users, online users, admins, banned users, chats
- Search members
- Make admins / demote admins
- Ban / unban members
- Set member XP
- Rename members
- Delete member accounts
- Post site-wide announcements
- Admin activity/audit log
- Owner protection for `josh`

## Run locally
```bat
npm install
npm start
```
Open `http://localhost:3000`.

## Render
Build command: `npm install`
Start command: `npm start`

Set `ADMIN_USERNAME` to `josh` if desired for compatibility with older deployment settings. The current server already hard-codes `josh` as the owner.

For production, set a strong `SESSION_SECRET`. If using Nova AI, configure `OPENAI_API_KEY` or an OpenAI-compatible `AI_BASE_URL` and `AI_MODEL`.

SQLite data is stored in `DATA_DIR` when that environment variable is set.
