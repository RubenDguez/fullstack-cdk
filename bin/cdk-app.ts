#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CdkAppStack } from '../lib/cdk-app-stack';
import * as dotenv from 'dotenv';

dotenv.config();

const app = new cdk.App();
new CdkAppStack(app, 'CdkAppStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  }
});
