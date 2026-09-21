# PV4 — Live Race Timing Results Stack

An AWS CDK application that ingests real-time race timing updates (bib, lane,
split status), processes them idempotently, and exposes aggregated results
and stats through a GraphQL API and a static dashboard.

## Architecture

```
                 ┌───────────────┐
  POST /timing   │  HTTP API     │
 ───────────────►│ (API Gateway  │
  x-api-key      │   v2 HTTP)    │
                 └───────┬───────┘
                         │ Lambda authorizer (x-api-key)
                         ▼
                 ┌───────────────┐
                 │ IngestFunction │  validates JSON is an object,
                 │   (Lambda)     │  forwards raw body
                 └───────┬───────┘
                         ▼
                 ┌───────────────┐
                 │  UpdatesSQS    │
                 └───────┬───────┘
                         ▼ (batch size 10)
                 ┌───────────────┐
                 │  SQSConsumer   │  1. validate schema (arktype)
                 │   (Lambda)     │  2. dedupe (idempotency table)
                 │                │  3. upsert result (revision-guarded)
                 │                │  4. increment stats counters
                 └───┬───────┬────┘
                     ▼       ▼
        ┌────────────────┐ ┌──────────────────┐
        │ EventResults    │ │ SystemStats       │
        │ Table (DDB)     │ │ Table (DDB)       │
        └────────┬────────┘ └─────────┬─────────┘
                  │                    │
                  ▼                    ▼
            ┌─────────────────────────────────┐
            │        AppSync GraphQL API        │
            │  results | events | eventStats |  │
            │        updatesRejected            │
            └────────────────┬───────────────────┘
                              ▼
                 ┌─────────────────────────┐
                 │  DashboardSite (S3 +     │
                 │  CloudFront static site) │
                 └─────────────────────────┘
```

## How data flows

1. **Ingest** — Timing devices/scoring software `POST` an event update to
   `/timing`. A custom Lambda authorizer checks the `x-api-key` header
   against a configured key. `IngestFunction` does a light shape check
   (valid JSON object, not an array) and drops the raw body onto
   `UpdatesSQS` for buffering/back-pressure.

2. **Process** — `SQSConsumer` pulls batches off the queue and, per message:
   - Validates the payload against the `eventUpdate` schema (`utils/types.ts`,
     built with [arktype](https://arktype.io)) — `eventId`, `bib`, `lane`,
     `revision`, `status` (`PROVISIONAL` | `CONFIRMED` | `OFFICIAL`), `timeMs`.
     Invalid payloads increment a rejected-count stat and are dropped.
   - Checks `UpdatesIdempotencyTable` with a conditional put keyed on
     `eventId#bib#status#revision` to drop messages that were already
     processed (e.g. re-delivered by SQS).
   - Writes to `EventResultsTable` with a conditional put that only accepts
     the update if there's no existing row or the incoming `revision` is
     newer — so out-of-order/duplicate deliveries can't clobber newer data.
   - Increments per-event and system-wide counters (`tracked`, `accepted`,
     `ignored`, `rejected`) in `SystemStatsTable`.

3. **Query** — An AppSync GraphQL API serves:
   - `results` — resolved directly against `EventResultsTable` via a JS
     resolver (no Lambda in the hot path).
   - `events` — Lambda resolver that scans `SystemStatsTable` for
     `#tracked` rows and derives the distinct list of event IDs (see the
     scaling note in `lambda/graphql-events.ts`).
   - `eventStats` — Lambda resolver that batch-gets tracked/accepted/ignored
     counters for one event.
   - `updatesRejected` — Lambda resolver returning the system-wide rejected
     count.

4. **Dashboard** — `DashboardSite` deploys a static site to a private S3
   bucket fronted by CloudFront (OAC, HTTPS-only), and writes a
   `config.json` alongside the static assets at deploy time containing the
   resolved AppSync URL and API key so the frontend can call GraphQL
   directly.

## Project structure

```
pv4-stack.ts                        CDK stack: wires API Gateway, SQS, DynamoDB,
                                     AppSync, and the dashboard site together

constructs/
  ingest-authorizer.ts               Lambda authorizer construct (API key check)
  graphql-api.ts                     AppSync API + resolvers (direct DDB + Lambda)
  dashboard-site.ts                  S3 + CloudFront static site + config.json

lambda/
  ingest.ts                          HTTP handler: validate shape, enqueue to SQS
  ingest-authorizer.ts               Authorizer handler: compares x-api-key
  sqs-consumer.ts                    SQS batch handler: validate → dedupe → upsert
  graphql-events.ts                  Resolver: distinct event IDs
  graphql-event-stats.ts             Resolver: per-event stat counters
  graphql-updates-rejected.ts        Resolver: system-wide rejected count

utils/
  consts.ts                          Env var names + system stat type constants
  types.ts                           arktype schema for an incoming event update
  check-duplicate-event-message.ts   Idempotency check via conditional put
  update-bib-status.ts               Revision-guarded upsert into results table
  update-system-stats.ts             Atomic counter increments

graphql/
  schema.graphql                     AppSync schema (referenced, not shown here)
  resolvers/query.results.js         JS resolver for the `results` query

static/                              Dashboard frontend assets (referenced, not
                                     shown here) deployed to S3
```

## DynamoDB tables

| Table                 | Partition key                                     | Sort key | Purpose                                              |
| --------------------- | ------------------------------------------------- | -------- | ---------------------------------------------------- |
| `updates-idempotency` | `idempotencyKey` (`eventId#bib#status#revision`)  | —        | Dedupe re-delivered SQS messages                     |
| `event-results`       | `eventId`                                         | `bib`    | Latest known status per athlete per event            |
| `system-stats`        | `statType` (`eventId#stat` or `SYSTEM_WIDE#stat`) | —        | Rolling counters (tracked/accepted/ignored/rejected) |

All three are provisioned-capacity (10 RCU/10 WCU) with `DESTROY` removal
policy — intended for a short-lived event, not long-term production data
retention.

## Environment variables (set by CDK on each Lambda)

| Variable              | Set on                         | Meaning                             |
| --------------------- | ------------------------------ | ----------------------------------- |
| `QUEUE_URL`           | IngestFunction                 | SQS queue to publish raw updates to |
| `API_KEY`             | ingest-authorizer Lambda       | Expected `x-api-key` value          |
| `IDEMPOTENCY_TABLE`   | SQSConsumer                    | `updates-idempotency` table name    |
| `EVENT_RESULTS_TABLE` | SQSConsumer                    | `event-results` table name          |
| `EVENT_STATS_TABLE`   | SQSConsumer, GraphQL resolvers | `system-stats` table name           |

## Known gaps / TODOs (from code comments)

- Invalid/rejected payloads aren't persisted anywhere queryable beyond a
  counter — there's an open TODO to store rejected payloads (e.g. to S3) for
  debugging.
- Errors thrown while processing an SQS message that aren't
  validation-related (e.g. a DynamoDB outage) are only logged, not counted
  separately — a `updatesFailed` stat is suggested but not implemented.
- `events` query does a full table scan of `system-stats`; the code notes
  this won't scale indefinitely and suggests a dedicated events table/GSI
  written on first bib update.

## Deploying

Standard CDK workflow (adjust for your environment/toolchain):

```bash
nvm use/install
npm install
cdk deploy
```

On success, CDK outputs the ingest API URL, GraphQL API URL/key, and the
CloudFront dashboard URL.
