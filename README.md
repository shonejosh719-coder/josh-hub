# JOSH HUB ONLINE 3.0

A full-stack JOSH HUB with accounts, profiles, XP/levels, favourites, saved Nova chats, admin tools, Roblox HQ, MTB Zone and creator links.

## Run on Windows

```cmd
npm install
npm start
```

Open `http://localhost:3000`.

## Real Nova AI

The site supports an OpenAI-compatible `/v1/chat/completions` provider.

For a hosted deployment, set:
- `OPENAI_API_KEY`
- `AI_MODEL` (default `gpt-4.1-mini`)

For a local compatible server such as Ollama, set:
- `AI_BASE_URL=http://127.0.0.1:11434/v1`
- `AI_MODEL=llama3.2`

## Admin

Set `ADMIN_USERNAME` to the username that should be an admin before that account is created (or restart after setting it). Admin users get an Admin HQ section.

## Render

The repository includes `render.yaml`. Push this folder to a Git repository and create a Render Web Service from it. Add your AI key as a secret environment variable. The included disk config stores SQLite data under `/var/data`.

Never commit `.env` or API keys.


## Owner account
The JOSH HUB owner username is permanently set to `josh`. Any existing or newly-created account named `josh` is assigned the `admin` role automatically.
