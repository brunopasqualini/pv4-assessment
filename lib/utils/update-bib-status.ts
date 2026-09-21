import { DynamoDBDocumentClient, PutCommand, PutCommandInput } from '@aws-sdk/lib-dynamodb';
import { ENV_EVENT_RESULTS_TABLE } from './consts';
import { EventUpdate } from './types';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { Logger } from '@aws-lambda-powertools/logger';
import { incrementEventStats } from './update-system-stats';

const EVENT_RESULTS_TABLE = process.env[ENV_EVENT_RESULTS_TABLE];

export async function updateBibStatus(input: {
  docClient: DynamoDBDocumentClient;
  logger: Logger;
  update: EventUpdate;
}): Promise<void> {
  const { docClient, logger, update } = input;
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
    // first update for athlete
    if (!res.Attributes) {
      logger.info('first bib update', { update });
      await incrementEventStats({ docClient, logger, eventId: update.eventId, stat: 'tracked' });
    } else {
      logger.info('bib stats updated', { update });
    }
    await incrementEventStats({ docClient, logger, eventId: update.eventId, stat: 'accepted' });
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException) {
      logger.warn('bib update is stale, ignoring', { update });
      await incrementEventStats({ docClient, logger, eventId: update.eventId, stat: 'ignored' });
    } else {
      logger.error('error updating bib status', { error: JSON.stringify(e) });
      throw e;
    }
  }
}
