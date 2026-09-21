import * as cdk from 'aws-cdk-lib/core';
import * as path from 'path';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import { Construct } from 'constructs';

export class DashboardSite extends Construct {
  constructor(scope: Construct, id: string, api: appsync.GraphqlApi) {
    super(scope, id);

    const bucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
    });

    new s3deploy.BucketDeployment(this, 'DeploySite', {
      sources: [
        s3deploy.Source.asset(path.join(__dirname, '../static')),
        // resolved to real values by the deployment at deploy time, then written as a JSON file
        s3deploy.Source.jsonData('config.json', { apiUrl: api.graphqlUrl, apiKey: api.apiKey }),
      ],
      destinationBucket: bucket,
      distribution: distribution,
      // invalidate on every deploy so changes show up immediately
      distributionPaths: ['/*'],
    });

    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://${distribution.distributionDomainName}`,
    });
  }
}
