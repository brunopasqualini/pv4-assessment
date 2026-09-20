import { Logger } from '@aws-lambda-powertools/logger';
import { SQSEvent, SQSBatchResponse, Context } from 'aws-lambda';
import { type } from 'arktype';
import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ENV_UPDATES_CHECK_TABLE } from '../consts';

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
const TABLE_NAME = process.env[ENV_UPDATES_CHECK_TABLE];

export async function handler(event: SQSEvent, context: Context): Promise<SQSBatchResponse> {
  logger.logEventIfEnabled(event);
  logger.addContext(context);

  for (const record of event.Records) {
    try {
      logger.info('Message received', record.body);
      await processMessage(record.body);
    } catch (error) {
      logger.error('Message failed to process', { error });
    }
  }

  return { batchItemFailures: [] };
}

async function processMessage(body: string): Promise<void> {
  // parse SQS message to a valid event update
  const result = eventUpdate(JSON.parse(body));

  if (result instanceof type.errors) {
    // TODO: Add errors to updatesRejected
    logger.error('Invalid event update', body);
    return;
  }
  await isDuplicateMessage(result);
}

async function isDuplicateMessage(update: EventUpdate): Promise<boolean> {
  const idempotencyKey = `${update.eventId}#${update.bib}#${update.status}#${update.revision}`;
  const params = {
    TableName: TABLE_NAME,
    Item: { idempotencyKey },
    ConditionExpression: 'attribute_not_exists(idempotencyKey)',
  };

  try {
    await docClient.send(new PutCommand(params));
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException) {
      // TODO: Increase updatesIgnored
      logger.warn('Event update already processed', e);
    } else {
      // TODO: Any other exception should increase updatesRejected
      logger.error('Error checking duplicate message', JSON.stringify(e));
    }
    return true;
  }

  return false;
}
