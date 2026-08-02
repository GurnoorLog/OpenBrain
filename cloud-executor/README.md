# OpenBrain Cloud Executor

Server-side execution for OpenBrain brains. Runs any saved brain graph on
Render (cloud CPU, server-side API key) instead of in the browser. Two
entrypoints:

- **Web Service** — `POST /run` runs a brain on demand (the "Run in cloud"
  button in the app). Liveness at `GET /health`.
- **Workflow** — `node workflow.js` runs a saved brain on a cron schedule
  (Render Workflows). Set `BRAIN_ID` to any project id in Supabase.

Zero runtime dependencies (plain Node 18+).

## Deploy (Render Blueprint, one click)

1. Push the repo to GitHub (already done: `GurnoorLog/OpenBrain`).
2. In Render → **New → Blueprint** → select the `OpenBrain` repo. `render.yaml`
   at the repo root defines the web service + the scheduled workflow.
3. When prompted, set these environment variables:

   | Where        | Variable                  | Value                                  |
   |--------------|---------------------------|----------------------------------------|
   | web service  | `FIREWORKS_API_KEY`       | your Fireworks API key                 |
   | web service  | `CLOUD_LLM_MODEL`         | optional (defaults to deepseek-v4-flash) |
   | workflow     | `FIREWORKS_API_KEY`       | your Fireworks API key                 |
   | workflow     | `SUPABASE_URL`            | your project URL                       |
   | workflow     | `SUPABASE_SERVICE_ROLE_KEY` | service-role key (server-side only)  |
   | workflow     | `BRAIN_ID`                | a project id in Supabase to run on schedule |

4. Copy the web service URL (e.g. `https://openbrain-cloud-executor.onrender.com`)
   and set it in the app as `VITE_CLOUD_EXECUTOR_URL` (add it to `.env`, then
   redeploy the Vercel site with that env var).

## API

```
POST /run
{ "brain": { "nodes": [...], "connections": [...] }, "memory": "" }

-> { "ok": true, "outputs": { nodeId: { response, ... } }, "order": [...], "durationMs": 1234, "log": [...] }
```

## Test locally

```bash
cd cloud-executor
FIREWORKS_API_KEY=... node server.js
curl http://localhost:3000/health
```
