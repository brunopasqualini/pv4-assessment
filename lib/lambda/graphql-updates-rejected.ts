import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ENV_SYSTEM_STATS_TABLE, SYSTEM_STATS } from '../utils/consts';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const SYSTEM_STATS_TABLE = process.env[ENV_SYSTEM_STATS_TABLE];

export async function handler(): Promise<number> {
  const res = await docClient.send(
    new GetCommand({
      TableName: SYSTEM_STATS_TABLE,
      Key: { statType: `SYSTEM_WIDE#${SYSTEM_STATS.UPDATES_REJECTED}` },
    })
  );

  return (res.Item?.tally as number) ?? 0;
}
