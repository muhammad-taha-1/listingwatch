# ListingWatch: Restaurant Listing Health Checker

## What this project is
A portfolio project that checks whether restaurants' online-ordering links work and point to the
right place, and uses an LLM to suggest improvements to restaurant listing descriptions.
It mirrors real-world Google Business Profile "routing accuracy" work (making sure the
"Order online" button sends customers to the right ordering site).

Second goal: learn AWS end to end (Lambda, API Gateway, EventBridge, CloudWatch, SSM, IAM,
SAM, GitHub Actions with OIDC). Learning matters as much as shipping.

The full build plan is in `docs/PLAN.md`. Work one phase at a time.

## How to work with me
- I'm an experienced MERN/Angular engineer but NEW to AWS. When you touch AWS files
  (`template.yaml`, IAM policies, GitHub Actions deploy steps), explain briefly what each
  resource does and why, so I can explain it in an interview.
- For anything non-trivial: read the relevant code, propose a plan, and wait for my approval.
- Work in small steps. Run lint and tests after each step. Keep commits small and focused.
- NEVER run commands that create cloud resources or cost money (`sam deploy`, `aws ... create/put/delete`,
  Atlas changes) without asking me first. Prefer to give me the command and let me run it.
- NEVER commit secrets or print secret values. Secrets live in `.env` locally (git-ignored)
  and in AWS SSM Parameter Store in production.
- If a requirement in PLAN.md seems wrong or over-engineered, say so and suggest a better option.

## Stack
- **API:** Node.js 22, TypeScript, Express, Mongoose, zod (validation), pino (JSON logs),
  p-limit (concurrency), @anthropic-ai/sdk. Runs locally as a normal Express server and on
  AWS Lambda via `serverless-http`.
- **Database:** MongoDB Atlas (free M0 cluster).
- **Web:** React + Vite + TypeScript, TanStack Query, plain CSS or Tailwind. Deployed to Vercel.
- **Infra:** AWS SAM (`template.yaml`) with esbuild bundling. HTTP API (API Gateway),
  two Lambdas (API + scheduled checker), EventBridge schedule, CloudWatch alarm -> SNS email,
  SSM Parameter Store for secrets.
- **CI/CD:** GitHub Actions. CI on every PR (lint, typecheck, test). Deploy on merge to main
  using OIDC (no long-lived AWS keys).
- **Tests:** Vitest + Supertest for the API. `mongodb-memory-server` for DB tests.
- **LLM:** Claude Haiku 4.5 (`claude-haiku-4-5-20251001`), low temperature, JSON output
  validated with zod.

## Repo layout
```
/api
  /src
    app.ts              # Express app (no listen) - shared by local server and Lambda
    server.ts           # local entry: app.listen
    lambda.ts           # Lambda entry: serverless-http(app)
    checker-job.ts      # Lambda entry for the scheduled daily check
    /routes             # restaurants, checks, reviews, health
    /services           # linkChecker, aiReviewer, importer
    /models             # Mongoose models
    /lib                # db connection, config (zod-validated env), logger, errors
  /test
/web
  /src
/docs
  PLAN.md
template.yaml
.github/workflows/
```

## Commands
- `cd api && npm run dev` - local API on http://localhost:4000
- `cd api && npm test` - tests
- `cd api && npm run lint && npm run typecheck`
- `cd web && npm run dev` - local dashboard on http://localhost:5173 (needs `web/.env`, see `web/.env.example`)
- `cd web && npm run lint && npm run typecheck && npm test` - web checks (lint is oxlint)
- `sam build` / `sam deploy` - build and deploy (I run deploy myself)
- `sam logs -n ApiFunction --tail` - tail production logs

## Conventions
- TypeScript strict mode. No `any` without a comment explaining why.
- Validate every request body and query with zod at the route level.
- Async route handlers wrapped so errors reach the central error middleware.
- Every log line is structured JSON and includes `requestId` or `runId`.
- Config is read once from env via `lib/config.ts` and validated with zod; the app fails
  fast at startup if something is missing.
- Mongo connection is created once and reused (important for Lambda warm starts);
  small pool (`maxPoolSize: 5`), `serverSelectionTimeoutMS: 5000`.
- Outbound HTTP checks: timeout 10s, max 5 concurrent, follow redirects, record final URL.
- LLM calls: timeout, one retry on 429/5xx, validate output with zod, store token usage.
- The LLM API key is only ever used server-side. Never in `/web`.

## Data model (summary)
- `restaurants`: name, city, expectedOrderUrl, description, createdAt, updatedAt
- `checkRuns`: startedAt, finishedAt, trigger ("manual" | "schedule"), totals by result, status
- `checkResults`: restaurantId, runId, result ("ok" | "broken" | "wrong_destination" | "timeout"),
  statusCode, finalUrl, latencyMs, checkedAt. Index `{ restaurantId: 1, checkedAt: -1 }`.
- `aiReviews`: restaurantId, score (0-100), issues[], suggestedDescription, model,
  inputTokens, outputTokens, createdAt

## Environment variables
`MONGODB_URI`, `ANTHROPIC_API_KEY`, `ADMIN_TOKEN` (simple bearer token protecting write routes),
`LOG_LEVEL`, `CORS_ORIGIN`. In Lambda, secrets are loaded from SSM Parameter Store at cold
start and cached (SSM parameter names passed as env vars, e.g. `MONGODB_URI_PARAM`).

## Out of scope (unless I ask)
User accounts and login systems, payments, real Google Business Profile API calls,
Kubernetes, microservices.
