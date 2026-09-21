import * as cdk from 'aws-cdk-lib/core';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { ENV_SYSTEM_STATS_TABLE } from '../utils/consts';

export interface Props {
  eventResultTable: dynamodb.Table;
  systemStatsTable: dynamodb.Table;
}

export class GraphqlApiConstruct extends Construct {
  public readonly api: appsync.GraphqlApi;

  constructor(scope: Construct, id: string, { eventResultTable, systemStatsTable }: Props) {
    super(scope, id);

    this.api = new appsync.GraphqlApi(this, 'GraphQLApi', {
      name: 'pv4-results-api',
      definition: appsync.Definition.fromFile(path.join(__dirname, '../graphql/schema.graphql')),
      authorizationConfig: {
        defaultAuthorization: { authorizationType: appsync.AuthorizationType.API_KEY },
      },
      logConfig: { fieldLogLevel: appsync.FieldLogLevel.ERROR },
    });

    new cdk.CfnOutput(this, 'GraphQLApiUrl', { value: this.api.graphqlUrl });
    new cdk.CfnOutput(this, 'GraphQLApiKey', { value: this.api.apiKey ?? 'UNKOWN' });

    this.api
      .addDynamoDbDataSource('EventResultsDataSource', eventResultTable)
      .createResolver('QueryResultsResolver', {
        typeName: 'Query',
        fieldName: 'results',
        code: appsync.Code.fromAsset(path.join(__dirname, '../graphql/resolvers/query.results.js')),
        runtime: appsync.FunctionRuntime.JS_1_0_0,
      });

    const statsResolvers: { id: string; entry: string; fieldName: string }[] = [
      { id: 'Events', entry: 'graphql-events.ts', fieldName: 'events' },
      { id: 'EventStats', entry: 'graphql-event-stats.ts', fieldName: 'eventStats' },
      { id: 'UpdatesRejected', entry: 'graphql-updates-rejected.ts', fieldName: 'updatesRejected' },
    ];

    for (const { id: resolverId, entry, fieldName } of statsResolvers) {
      const fn = new NodejsFunction(this, `${resolverId}Function`, {
        runtime: lambda.Runtime.NODEJS_24_X,
        entry: path.join(__dirname, `../lambda/${entry}`),
        handler: 'handler',
        logRetention: logs.RetentionDays.ONE_WEEK,
        environment: { [ENV_SYSTEM_STATS_TABLE]: systemStatsTable.tableName },
      });
      systemStatsTable.grantReadData(fn);

      this.api
        .addLambdaDataSource(`${resolverId}DataSource`, fn)
        .createResolver(`Query${resolverId}Resolver`, { typeName: 'Query', fieldName });
    }
  }
}
