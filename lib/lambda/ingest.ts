import { Logger } from '@aws-lambda-powertools/logger';
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';

const logger = new Logger();

export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context
): Promise<APIGatewayProxyResultV2> => {
  logger.logEventIfEnabled(event);
  logger.addContext(context);
  logger.info('Payload received', { body: event.body });
  return { statusCode: 200, body: JSON.stringify({ message: 'Ok' }) };
};
