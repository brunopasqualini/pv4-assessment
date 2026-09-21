import * as cdk from 'aws-cdk-lib/core';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';
import { IngestAuthorizerConstruct } from './constructs/ingest-authorizer';
import { HttpApi } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpMethod } from 'aws-cdk-lib/aws-events';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import {
  ENV_EVENT_RESULTS_TABLE,
  ENV_QUEUE_URL,
  ENV_IDEMPOTENCY_TABLE,
  ENV_SYSTEM_STATS_TABLE,
} from './utils/consts';
import { GraphqlApiConstruct } from './constructs/graphql-api';

export class Pv4Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const ingestFunction = new NodejsFunction(this, 'IngestFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: path.join(__dirname, '/lambda/ingest.ts'),
      handler: 'handler',
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    const auth = new IngestAuthorizerConstruct(this, 'IngestAuthorizer', {
      apiKey: 'pv4-ingest-key',
    });

    const httpApi = new HttpApi(this, 'IngestApi');
    httpApi.addRoutes({
      path: '/ingest',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('IngestIntegration', ingestFunction),
      authorizer: auth.authorizer,
    });

    new cdk.CfnOutput(this, 'IngestApiUrl', { value: httpApi.url ?? 'UNKOWN' });

    const queue = new sqs.Queue(this, 'UpdatesSQS', {
      queueName: 'updates-sqs',
      visibilityTimeout: cdk.Duration.seconds(30),
      retentionPeriod: cdk.Duration.days(1),
    });

    queue.grantSendMessages(ingestFunction);
    ingestFunction.addEnvironment(ENV_QUEUE_URL, queue.queueUrl);

    const queueConsumer = new NodejsFunction(this, 'SQSConsumer', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: path.join(__dirname, '/lambda/sqs-consumer.ts'),
      handler: 'handler',
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    queueConsumer.addEventSource(new lambdaEventSources.SqsEventSource(queue, { batchSize: 10 }));

    const idempotencyTable = new dynamodb.Table(this, 'UpdatesIdempotencyTable', {
      tableName: 'updates-idempotency',
      partitionKey: { name: 'idempotencyKey', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 10,
      writeCapacity: 10,
    });

    queueConsumer.addEnvironment(ENV_IDEMPOTENCY_TABLE, idempotencyTable.tableName);
    idempotencyTable.grantReadWriteData(queueConsumer);

    const eventResultTable = new dynamodb.Table(this, 'EventResultsTable', {
      tableName: 'event-results',
      partitionKey: { name: 'eventId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'bib', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 10,
      writeCapacity: 10,
    });

    queueConsumer.addEnvironment(ENV_EVENT_RESULTS_TABLE, eventResultTable.tableName);
    eventResultTable.grantReadWriteData(queueConsumer);

    const systemStatsTable = new dynamodb.Table(this, 'SystemStatsTable', {
      tableName: 'system-stats',
      partitionKey: { name: 'statType', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 10,
      writeCapacity: 10,
    });

    queueConsumer.addEnvironment(ENV_SYSTEM_STATS_TABLE, systemStatsTable.tableName);
    systemStatsTable.grantReadWriteData(queueConsumer);

    new GraphqlApiConstruct(this, 'GraphqlApi', { eventResultTable, systemStatsTable });
  }
}
