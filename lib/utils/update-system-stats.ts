import { DynamoDBDocumentClient, UpdateCommand, UpdateCommandInput } from '@aws-sdk/lib-dynamodb';
import { ENV_SYSTEM_STATS_TABLE, SYSTEM_STATS, SystemStats } from './consts';
import { Logger } from '@aws-lambda-powertools/logger';

const SYSTEM_STATS_TABLE = process.env[ENV_SYSTEM_STATS_TABLE];

async function incrementStats(input: {
  docClient: DynamoDBDocumentClient;
  logger: Logger;
  eventId: string;
  stat: SystemStats;
}): Promise<void> {
  const { docClient, logger, eventId, stat } = input;

  const statType = `${eventId}#${stat}`;

  const params: UpdateCommandInput = {
    TableName: SYSTEM_STATS_TABLE,
    Key: { statType },
    UpdateExpression: 'ADD tally :incr',
    ExpressionAttributeValues: { ':incr': 1 },
  };

  try {
    await docClient.send(new UpdateCommand(params));
    logger.info('system stats updated', { eventId, statType });
  } catch (e) {
    logger.error('error updating system stats', { error: JSON.stringify(e) });
    throw e;
  }
}

export async function incrementSystemFailure(
  docClient: DynamoDBDocumentClient,
  logger: Logger
): Promise<void> {
  await incrementStats({
    docClient,
    logger,
    eventId: 'SYSTEM_WIDE',
    stat: SYSTEM_STATS.UPDATES_REJECTED,
  });
}

export async function incrementEventStats(input: {
  docClient: DynamoDBDocumentClient;
  logger: Logger;
  eventId: string;
  stat: Exclude<SystemStats, typeof SYSTEM_STATS.UPDATES_REJECTED>;
}): Promise<void> {
  const { docClient, logger, eventId, stat } = input;
  await incrementStats({ docClient, logger, eventId, stat });
}
