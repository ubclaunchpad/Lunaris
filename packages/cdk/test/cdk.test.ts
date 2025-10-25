import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as Cdk from '../lib/cdk-stack';

describe('CDK Stack', () => {
  test('Stack synthesizes without errors', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new Cdk.CdkStack(app, 'MyTestStack');
    // THEN
    const template = Template.fromStack(stack);
    
    // Basic test to ensure stack can be synthesized
    expect(template).toBeDefined();
  });
});
