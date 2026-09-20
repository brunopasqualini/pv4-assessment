#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { Pv4Stack } from '../lib/pv4-stack';

const app = new cdk.App();

const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION };

new Pv4Stack(app, 'Pv4Stack', { env });
