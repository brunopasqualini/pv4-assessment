import { Logger } from '@aws-lambda-powertools/logger';
import { SQSEvent, SQSBatchResponse, Context } from 'aws-lambda';
import { type } from 'arktype';

const logger = new Logger();

export const raceResult = type({
  eventId: 'string.trim |> string > 0',
  bib: 'string.trim |> string > 0',
  lane: 'number.integer',
  revision: 'number.integer >= 1',
  status: "'PROVISIONAL' | 'CONFIRMED' | 'OFFICIAL'",
  timeMs: 'number.integer > 0',
  recordedAt: 'string',
});

export type RaceResult = typeof raceResult.infer;

export async function handler(event: SQSEvent, context: Context): Promise<SQSBatchResponse> {
  logger.logEventIfEnabled(event);
  logger.addContext(context);

  for (const record of event.Records) {
    try {
      logger.info('Message', record.body);
      await processMessage(record.body);
    } catch (error) {
      logger.error('Failed to process message', { messageId: record.messageId, error });
    }
  }

  return { batchItemFailures: [] };
}

async function processMessage(body: string): Promise<void> {
  const result = raceResult(JSON.parse(body));

  if (result instanceof type.errors) {
    logger.error('Invalid msg', body);
    return;
  }
  logger.info('OK msg', body);
}
