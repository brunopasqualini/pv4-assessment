# Decisions

### 1. Known concessions

#### 1.1 Not implemented due time constraint

- Custom CloudWatch metric
- CloudWatch alarm, defined in CDK
- Corrupt payload
  - The system does not store corrupt payloads, only logs them in CloudWatch

#### 1.2 Pipeline-wide field updatesRejected

I was not too sure whether the `updatesRejected` field should be incremented when the `/timing` endpoint receives a request that isn't a JSON object. For example, if the endpoint receives any of the following, which aren't even close to an `event update`, I thought it'd be better not to increment `updatesRejected` because the payload is completely wrong, not even an `'empty'` object like `{}` with no properties:

- 23 - `number`
- 'abcdf' - `string`
- '' - `string`
- '[]' - `string` - but an array when parsed
- null - `null`
- `undefined`

#### 1.3 Creation of a new field updatesFailed?

When I was testing the data ingestion flow to understand how my archicture would behave, I ended up wrapping certain operations(eg: writing to DynamoDB) in try/catch blocks. These blocks are there to allow the system to consume messages and operate without interruptions. However, I did not implement any mechanism to trace back to the root cause of a system error/exception. Therefore, when certain errors/exceptions are thrown, the aplication only logs the error, along with some context, but does not increment any system-wide field, like `updatesRejected`, that's why having one more field `updatesFailed` could be useful too.

#### 1.4 DynamoDB performance

Initially, I had considered creating only one DynamoDB table to manage and store the data of the `events`. Then, I tried to picture that working in practise, based on the GraphQL schema, and decided that it would not be suitable and I created three other tables instead. Later, when the whole system was working and I could see data being stored as so on, I looked again at the GraphQL schema to fetch some data and noticed that the system would need to do a full scan on the `system-stats` table to get a list of `event IDs` to be returned by the `Query.events` resolver. Unfortunately, I only saw that later and decided not to refactor that part of the system because I was out of time and would need to re-test the entire flow of the system.

#### 1.5 Currently not storing payload that fails validation

The system currently does not store payloads of `event updates` that fail validation, it only logs it. My intention was to store the `raw` messages in a S3 bucket so that they could be looked at for further investigation, however, I did not have time left.

### 2. How it works, and why

To prevent repeat deliveries from being processed more than once, I added a small `DynamoDB` lookup table. Each update is given a fingerprint made from the `eventId`, `bib`, `status`, and `revision`. Before processing the update, `sqs-consumer.ts` tries to conditionally insert that fingerprint. The insert succeeds only the first time. If the same message is delivered again, `DynamoDB` throws a `ConditionalCheckFailedException`, which is caught and treated as a duplicate. This prevents the update from being written or counted twice.

The revision check is handled separately in another table because it answers a different question: “is this update newer than the one store?” The write is conditional on either no existing result for that `bib`, or the stored `revision` being `lower` than the `incoming revision`. Status is deliberately excluded from this condition, so it cannot affect whether an update is considered newer.

Keeping these checks separate also provides a second layer of protection. For example, two messages with the same revision but different `statuses` would produce different fingerprints and therefore both pass the deduplication check. The `revision` condition prevents the second write because its `revision` is not `newer`.

Payload validation happens before either of these checks. I use `arktype` to define the expected shape of an update and reject anything that does not match it. When validation fails, `/lambda/ingest.ts` logs the raw payload and the validation failure with the Lambda Powertools, and increments a counter for rejected updates rather than throwing an exception.

Each SQS record is also processed inside its own try/catch, so a malformed or otherwise failing message does not prevent the rest of the batch from being processed.

The main gap I would still flag is around rejected payloads. At the moment, the raw payload and validation failure are only available in the logs. There is no follow-up mechanism for storing rejected messages somewhere they can be retrieved and investigated later.

### 3. AI assistance

I mainly used AI to help with the setup and instantiation of AWS SDK classes and services such as DynamoDB, SQS, Lambda, and HTTP API, as well as troubleshooting AWS CDK and CloudFormation errors.

I did not use AI to come up with the architecture or design of the pipeline. I relied on my own knowledge to design and build a solution that satisfies the processor requirements, including idempotency, ordering, and validation. I’m confident in the solution I’ve built, but I’d also be interested to know whether there are alternative or more optimal approaches.

As this was my first time working with AppSync, and I wanted to avoid spending a significant amount of time setting it up from scratch with CDK. So, I provided my `/graphql/schema.graphql` to Claude and asked it to generate a GraphQL construct (`/constructs/graphql-api.ts`) with custom field resolvers pointing to each of the DynamoDB tables. This means that anything in this project that handles GraphQL has been written by AI. However, I reviewed the generated code, made sure I understood how it worked, and made minor adjustments to fit with my existing PV4 stack.

The S3 HTML page (`/static/index.html`) was also written by AI.
