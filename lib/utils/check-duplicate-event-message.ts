import { DynamoDBDocumentClient, PutCommand, PutCommandInput } from '@aws-sdk/lib-dynamodb';
import { EventUpdate } from './types';
import { ENV_IDEMPOTENCY_TABLE } from './consts';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { Logger } from '@aws-lambda-powertools/logger';

const IDEMPOTENCY_TABLE = process.env[ENV_IDEMPOTENCY_TABLE];

export async function isEventUpdateDuplicate(input: {
  docClient: DynamoDBDocumentClient;
  logger: Logger;
  update: EventUpdate;
}): Promise<boolean> {
  const { docClient, logger, update } = input;

  const idempotencyKey = `${update.eventId}#${update.bib}#${update.status}#${update.revision}`;
  const params: PutCommandInput = {
    TableName: IDEMPOTENCY_TABLE,
    Item: { idempotencyKey },
    ConditionExpression: 'attribute_not_exists(idempotencyKey)',
  };

  try {
    await docClient.send(new PutCommand(params));
    return false;
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException) {
      logger.warn('event update already processed', { update });
    } else {
      logger.error('error saving event update idempotency key', { error: JSON.stringify(e) });
      throw e;
    }
  }
  return true;
}
