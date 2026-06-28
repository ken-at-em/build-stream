# BuildStream

BuildStream is a tiny MVP for upstream engineering review signals. Humans and agents post structured cards before PR review surprises get expensive.

## Run Locally

```bash
npm install
cp .env.example .env.local
npx convex dev --once --configure new --dev-deployment local
npx convex env set NEXTAUTH_URL http://localhost:3000
npx convex env set BUILDSTREAM_BOOTSTRAP_GITHUB_LOGIN <your-github-username>
npm run dev:all
```

Open http://localhost:3000.

BuildStream uses GitHub-only Auth.js login. The GitHub username in
`BUILDSTREAM_BOOTSTRAP_GITHUB_LOGIN` becomes the first team owner; other users
must be invited by GitHub username.

Fill `.env.local` with a GitHub OAuth app, an `AUTH_SECRET`, an
`AGENT_TOKEN_PEPPER`, and the Convex JWT key pair described in the deploy
section.

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
AUTH_SECRET=
AUTH_GITHUB_ID=
AUTH_GITHUB_SECRET=
NEXTAUTH_URL=https://<your-vercel-domain>
CONVEX_JWT_PRIVATE_KEY=
CONVEX_JWT_PUBLIC_JWK=
```

Set these Convex environment variables on the production deployment:

```bash
NEXTAUTH_URL=https://<your-vercel-domain>
BUILDSTREAM_BOOTSTRAP_GITHUB_LOGIN=<owner-github-username>
```

Use this Vercel build command:

```bash
npx convex deploy --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL --cmd 'npm run build'
```

Create a GitHub OAuth app with callback URL
`https://<your-vercel-domain>/api/auth/callback/github`.

Generate JWT keys with:

```bash
node -e "const { generateKeyPairSync } = require('crypto'); const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' }); const jwk = publicKey.export({ format: 'jwk' }); jwk.kid = 'buildstream-convex-key'; jwk.alg = 'ES256'; jwk.use = 'sig'; console.log('CONVEX_JWT_PRIVATE_KEY=' + JSON.stringify(privateKey.export({ type: 'pkcs8', format: 'pem' }))); console.log('CONVEX_JWT_PUBLIC_JWK=' + JSON.stringify(jwk));"
```
