import * as cdk from 'aws-cdk-lib/core';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { IngestAuthorizerConstruct } from './constructs/ingest-authorizer';
import { HttpApi } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpMethod } from 'aws-cdk-lib/aws-events';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';

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
  }
}
