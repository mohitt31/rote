# Deploying Rote (run only with Mohit's approval)

Nothing here has been run. Every step touches a host or an account, so Mohit runs or approves each one. Use free tiers only and never add a payment method.

Two sites from the same repository:

| | Private site | Public demo site |
| --- | --- | --- |
| Purpose | Mohit's own testing with the agent on | No-signup demo for judges, $0 |
| Login | Normal sign-in | `AUTH_DISABLED=true` (one shared user) |
| Agent | On (free-tier Gemini key) | Off: `ROTE_PUBLIC_DEMO=true` refuses every agent request server-side and disables MCP |
| Data | Persistent | Sample data only, wiped on the first visit after each hour |
| Database | Its own Neon database | A **separate** Neon database or branch |

## 1. Databases (Neon)

Create one Neon project with two databases (or two branches): `rote_private` and `rote_demo`. Copy each **pooled** connection string. Never paste them into chat or commit them.

## 2. Netlify sites

Create two Netlify sites from the GitHub repository (build settings come from `netlify.toml`; the production build runs `pnpm migrate:production` after `pnpm build`). Set environment variables in each site's settings:

| Variable | Private | Demo |
| --- | --- | --- |
| `DATABASE_URL` | `rote_private` pooled URL | `rote_demo` pooled URL |
| `BETTER_AUTH_SECRET` | output of `openssl rand -hex 32` | a different `openssl rand -hex 32` |
| `BETTER_AUTH_URL` | the site URL | the site URL |
| `BETTER_AUTH_TRUSTED_ORIGINS` | the site URL | the site URL |
| `GOOGLE_GENERATIVE_AI_API_KEY` | key from a billing-disabled project | **do not set** |
| `AGENT_ENGINE` / `AGENT_MODEL` | as in `.env.example` | not needed |
| `AUTH_DISABLED` | not set | `true` |
| `ROTE_PUBLIC_DEMO` | not set | `true` |

`netlify.toml` no longer carries the template's analytics IDs or its trusted origins; set the trusted origin per site.

## 3. After the first deploy

1. Open each site in an incognito window.
2. Private: sign in, open **Recurring tasks**, prepare a sample task and run the five steps; then ask the agent the teaching prompt from `docs/day-4.md`.
3. Demo: confirm the amber banner, run both sample tasks end to end, confirm that sending a chat message returns "The agent is turned off in the public demo".
4. Record the URLs in the README only after both checks pass.

## Notes

- Local multipart uploads are disabled when `DATABASE_URL` is set; hosted uploads need framework attachment storage, which is not configured. Sample buttons do not need uploads.
- The demo reset is lazy (first read after the hour), which suits serverless functions with no background timer.
