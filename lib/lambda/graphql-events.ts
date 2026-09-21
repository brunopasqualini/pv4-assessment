import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ENV_SYSTEM_STATS_TABLE, SYSTEM_STATS } from '../utils/consts';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const SYSTEM_STATS_TABLE = process.env[ENV_SYSTEM_STATS_TABLE];

// There's no dedicated "events" table — eventId only ever appears as a key
// fragment (event-results PK, or the "<eventId>#<stat>" statType in
// system-stats). We scan system-stats rather than event-results because it
// has one item per (event, stat) instead of one item per (event, bib), so
// it's the smaller table to scan. Every event that has accepted at least one
// update gets a "<eventId>#tracked" stat row (see update-bib-status.ts), so
// filtering on that suffix and stripping it gives the distinct event list.
//
// NOTE: this is still a full table scan and will not scale indefinitely.
// For production, consider maintaining a dedicated events table/GSI written
// to on first bib update, and swap this Lambda resolver for a direct
// DynamoDB Query resolver against it.
export async function handler(): Promise<string[]> {
  const trackedSuffix = `#${SYSTEM_STATS.ATHLETES_TRACKED}`;
  const eventIds = new Set<string>();
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const res = await docClient.send(
      new ScanCommand({
        TableName: SYSTEM_STATS_TABLE,
        FilterExpression: 'contains(statType, :suffix)',
        ExpressionAttributeValues: { ':suffix': trackedSuffix },
        ProjectionExpression: 'statType',
        ExclusiveStartKey: exclusiveStartKey,
      })
    );

    for (const item of res.Items ?? []) {
      const statType = item.statType as string;
      if (statType.endsWith(trackedSuffix)) {
        eventIds.add(statType.slice(0, -trackedSuffix.length));
      }
    }

    exclusiveStartKey = res.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return Array.from(eventIds);
}
