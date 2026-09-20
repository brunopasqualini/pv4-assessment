import { Logger } from '@aws-lambda-powertools/logger';
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';

const logger = new Logger();

import { type } from 'arktype';

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

export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context
): Promise<APIGatewayProxyResultV2> => {
  logger.logEventIfEnabled(event);
  logger.addContext(context);
  logger.info('Payload received', { body: event.body });

  const result = raceResult(JSON.parse(event.body ?? '[]'));

  if (result instanceof type.errors) {
    return { statusCode: 500, body: JSON.stringify({ message: result.summary }) };
  }

  return { statusCode: 200, body: JSON.stringify({ message: 'Ok' }) };
};
