import { Logger } from '@aws-lambda-powertools/logger';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';
import { ENV_QUEUE_URL } from '../utils/consts';

const logger = new Logger();
const sqs = new SQSClient({});

const QUEUE_URL = process.env[ENV_QUEUE_URL];

export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context
): Promise<APIGatewayProxyResultV2> => {
  logger.logEventIfEnabled(event);
  logger.addContext(context);
  logger.info('payload received', { body: event.body });

  try {
    const message = JSON.parse(event.body ?? '[]');

    if (typeof message !== 'object' || message === null || Array.isArray(message)) {
      // TODO: Add errors to updatesRejected
      return { statusCode: 400, body: JSON.stringify({ message: 'Invalid' }) };
    }
  } catch {
    // TODO: Add errors to updatesRejected?
    return { statusCode: 400, body: JSON.stringify({ message: 'Invalid' }) };
  }

  await sqs.send(new SendMessageCommand({ QueueUrl: QUEUE_URL, MessageBody: event.body }));

  return { statusCode: 200, body: JSON.stringify({ message: 'Ok' }) };
};
