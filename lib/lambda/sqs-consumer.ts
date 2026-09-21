import { Logger } from '@aws-lambda-powertools/logger';
import { SQSEvent, SQSBatchResponse, Context } from 'aws-lambda';
import { type } from 'arktype';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { eventUpdate } from '../utils/types';
import { updateBibStatus } from '../utils/update-bib-status';
import { isEventUpdateDuplicate } from '../utils/check-duplicate-event-message';
import { incrementEventStats, incrementSystemFailure } from '../utils/update-system-stats';

const logger = new Logger();

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

export async function handler(event: SQSEvent, context: Context): Promise<SQSBatchResponse> {
  logger.logEventIfEnabled(event);
  logger.addContext(context);

  for (const record of event.Records) {
    try {
      logger.info('message received', record.body);
      await processMessage(record.body);
    } catch (e) {
      // TODO: Should there be a new counter called updatesFailed? for things that are not related to data/payload validation
      logger.error('message failed to process', { error: JSON.stringify(e) });
    }
  }

  return { batchItemFailures: [] };
}

async function processMessage(body: string): Promise<void> {
  // parse SQS message to a valid event update
  const result = eventUpdate(JSON.parse(body));

  // check if the event update(payload) is corrupt
  if (result instanceof type.errors) {
    // TODO: Add errors to updatesRejected + s3 for debugging?
    await incrementSystemFailure(docClient, logger);
    logger.error('invalid event update', { message: result.summary, body });
    return;
  }

  const isDuplicate = await isEventUpdateDuplicate({ docClient, logger, update: result });
  // this event update has been processed before
  if (isDuplicate) {
    await incrementEventStats({ docClient, logger, eventId: result.eventId, stat: 'ignored' });
    return;
  }
  await updateBibStatus({ docClient, logger, update: result });
}
