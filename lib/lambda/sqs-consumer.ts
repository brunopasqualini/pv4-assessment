import { Logger } from '@aws-lambda-powertools/logger';
import { SQSEvent, SQSBatchResponse, Context } from 'aws-lambda';
import { type } from 'arktype';
import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, PutCommandInput } from '@aws-sdk/lib-dynamodb';
import { ENV_EVENT_RESULTS_TABLE, ENV_IDEMPOTENCY_TABLE } from '../consts';

const IDEMPOTENCY_TABLE = process.env[ENV_IDEMPOTENCY_TABLE];
const EVENT_RESULTS_TABLE = process.env[ENV_EVENT_RESULTS_TABLE];

const logger = new Logger();

const eventUpdate = type({
  eventId: 'string.trim |> string > 0',
  bib: 'string.trim |> string > 0',
  lane: 'number.integer',
  revision: 'number.integer >= 1',
  status: "'PROVISIONAL' | 'CONFIRMED' | 'OFFICIAL'",
  timeMs: 'number.integer > 0',
  recordedAt: 'string',
});

type EventUpdate = typeof eventUpdate.infer;

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

export async function handler(event: SQSEvent, context: Context): Promise<SQSBatchResponse> {
  logger.logEventIfEnabled(event);
  logger.addContext(context);

  for (const record of event.Records) {
    try {
      logger.info('Message received', record.body);
      await processMessage(record.body);
    } catch (e) {
      // TODO: Add errors to updatesRejected?
      logger.error('Message failed to process', { error: JSON.stringify(e) });
    }
  }

  return { batchItemFailures: [] };
}

async function processMessage(body: string): Promise<void> {
  // parse SQS message to a valid event update
  const result = eventUpdate(JSON.parse(body));

  if (result instanceof type.errors) {
    // TODO: Add errors to updatesRejected
    logger.error('Invalid event update', { message: result.summary, body });
    return;
  }

  await checkDuplicateMessage(result);
  await updateBibStatus(result);
}

async function checkDuplicateMessage(update: EventUpdate): Promise<void> {
  const idempotencyKey = `${update.eventId}#${update.bib}#${update.status}#${update.revision}`;
  const params: PutCommandInput = {
    TableName: IDEMPOTENCY_TABLE,
    Item: { idempotencyKey },
    ConditionExpression: 'attribute_not_exists(idempotencyKey)',
  };

  try {
    await docClient.send(new PutCommand(params));
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException) {
      // TODO: Increase updatesIgnored
      logger.warn('Event update already processed', { update });
    } else {
      logger.error('Error checking duplicate message', { error: JSON.stringify(e) });
      throw e;
    }
  }
}

async function updateBibStatus(update: EventUpdate): Promise<void> {
  const params: PutCommandInput = {
    TableName: EVENT_RESULTS_TABLE,
    Item: {
      eventId: update.eventId,
      bib: update.bib,
      lane: update.lane,
      revision: update.revision,
      status: update.status,
      timeMs: update.timeMs,
      recordedAt: update.recordedAt,
    },
    ConditionExpression: `
    attribute_not_exists(#revision)
    OR #revision < :revision
  `,
    ExpressionAttributeNames: { '#revision': 'revision' },
    ExpressionAttributeValues: { ':revision': update.revision },
    ReturnValues: 'ALL_OLD',
  };

  try {
    const res = await docClient.send(new PutCommand(params));
    // first status for athlete
    if (!res.Attributes) {
      logger.info('First athlete bib', { update });
      // TODO: new bib - increase athletesTracked
    } else {
      logger.info('Athlete bib updated', { update });
      // TODO: increase updatesAccepted
    }
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException) {
      // TODO: Stale increase updatesIgnored
      logger.warn('Bib update is stale, ignoring', { update });
    } else {
      logger.error('Error updating bib status', { error: JSON.stringify(e) });
      throw e;
    }
  }
}
