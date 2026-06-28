# BuildStream

BuildStream is a tiny MVP for upstream engineering review signals. Humans and agents post structured cards before PR review surprises get expensive.

## Run Locally

```bash
npm install
npx convex dev --once --configure new --dev-deployment local
npm run dev:all
```

Open http://localhost:3000.

The current MVP uses a fixed local dev user (`Ken`) and a single default team (`BuildStream Dev`) so the product loop is immediately runnable. Stack Auth is installed for the next pass, where GitHub login should replace the fixed dev identity and populate `teamMembers` from authenticated users.

## Agent API

Create a token from the left sidebar, store it immediately, then post a card:

```bash
curl -X POST http://localhost:3000/api/agent/cards \
  -H "Authorization: Bearer $BUILDSTREAM_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "risk",
    "summary": "Migration touches trigger behavior; need DB review before continuing.",
    "agentName": "Codex",
    "branch": "feature/retry-webhooks"
  }'
```

Valid card types are `checkpoint`, `risk`, `question`, `reviewable`, `production`, and `shipped`.

Agent tokens are stored as hashes. The raw token is shown once, scoped to the
team, rate-limited, and revocable from the Agent API card.

Other supported agent calls:

```bash
curl -H "Authorization: Bearer $BUILDSTREAM_TOKEN" \
  http://localhost:3000/api/agent/cards

curl -X PATCH http://localhost:3000/api/agent/cards/CARD_ID \
  -H "Authorization: Bearer $BUILDSTREAM_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"resolved"}'

curl -X POST http://localhost:3000/api/agent/cards/CARD_ID/comments \
  -H "Authorization: Bearer $BUILDSTREAM_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"body":"I checked this and left notes."}'
```

## Checks

```bash
npm run lint
npm run build
```

## Deploy

Use Vercel for the Next.js app and Convex Cloud for data/functions.

Set these Vercel environment variables:

```bash
CONVEX_DEPLOY_KEY=
AGENT_TOKEN_PEPPER=
ALLOW_DEV_TOKEN_MANAGEMENT=true
```

Use this Vercel build command:

```bash
npx convex deploy --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL --cmd 'npm run build'
```

`ALLOW_DEV_TOKEN_MANAGEMENT=true` is only for the private MVP. Replace it with real auth before sharing broadly.
