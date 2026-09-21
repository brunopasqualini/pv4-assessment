import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { AppSyncResolverEvent } from 'aws-lambda';
import { ENV_SYSTEM_STATS_TABLE, SYSTEM_STATS } from '../utils/consts';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const SYSTEM_STATS_TABLE = process.env[ENV_SYSTEM_STATS_TABLE] as string;

interface EventStatsArgs {
  eventId: string;
}

interface EventStats {
  eventId: string;
  athletesTracked: number;
  updatesAccepted: number;
  updatesIgnored: number;
}

export async function handler(event: AppSyncResolverEvent<EventStatsArgs>): Promise<EventStats> {
  const { eventId } = event.arguments;

  const trackedKey = `${eventId}#${SYSTEM_STATS.ATHLETES_TRACKED}`;
  const acceptedKey = `${eventId}#${SYSTEM_STATS.UPDATES_ACCEPTED}`;
  const ignoredKey = `${eventId}#${SYSTEM_STATS.UPDATES_IGNORED}`;

  const res = await docClient.send(
    new BatchGetCommand({
      RequestItems: {
        [SYSTEM_STATS_TABLE]: {
          Keys: [{ statType: trackedKey }, { statType: acceptedKey }, { statType: ignoredKey }],
        },
      },
    })
  );

  const items = res.Responses?.[SYSTEM_STATS_TABLE] ?? [];
  const tallyByStatType = new Map<string, number>(
    items.map((item) => [item.statType as string, item.tally as number])
  );

  return {
    eventId,
    athletesTracked: tallyByStatType.get(trackedKey) ?? 0,
    updatesAccepted: tallyByStatType.get(acceptedKey) ?? 0,
    updatesIgnored: tallyByStatType.get(ignoredKey) ?? 0,
  };
}
