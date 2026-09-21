import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import {
  HttpLambdaAuthorizer,
  HttpLambdaResponseType,
} from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as path from 'path';
import * as logs from 'aws-cdk-lib/aws-logs';
import { ENV_INGEST_API_KEY } from '../utils/consts';
export class IngestAuthorizerConstruct extends Construct {
  public readonly authorizer: HttpLambdaAuthorizer;

  constructor(scope: Construct, id: string, props: { apiKey: string }) {
    super(scope, id);

    const authFunction = new NodejsFunction(this, id, {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: path.join(__dirname, '../lambda/ingest-authorizer.ts'),
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: { [ENV_INGEST_API_KEY]: props.apiKey },
      handler: 'handler',
    });

    this.authorizer = new HttpLambdaAuthorizer(id, authFunction, {
      responseTypes: [HttpLambdaResponseType.SIMPLE],
      resultsCacheTtl: cdk.Duration.minutes(5),
      identitySource: ['$request.header.x-api-key'],
    });
  }
}
