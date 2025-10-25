import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { LambdaFunctions } from "./constructs/lambda-functions";
import { StepFunctions } from "./constructs/step-functions";
import { ApiGateway } from "./constructs/api-gateway";
import { DynamoDbTables } from "./constructs/dynamodb-tables";

export class CdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Create DynamoDB tables
    const dynamoDbTables = new DynamoDbTables(this, "DynamoDbTables");

    // Create Lambda functions
    const lambdaFunctions = new LambdaFunctions(this, "LambdaFunctions", {
      runningInstancesTable: dynamoDbTables.runningInstancesTable
    });

    // Grant EC2 permissions to deployInstance Lambda
    lambdaFunctions.deployInstanceFunction.addToRolePolicy(new PolicyStatement({
      actions: [
        'ec2:RunInstances',
        'ec2:CreateTags',
        'ec2:DescribeInstances'
      ],
      resources: [
        `arn:aws:ec2:${this.region}:${this.account}:subnet/subnet-12345678`
      ]
    }));

    // Grant DynamoDB write permissions to deployInstance Lambda
    dynamoDbTables.runningInstancesTable.grantWriteData(lambdaFunctions.deployInstanceFunction);

    // Create Step Functions
    const stepFunctions = new StepFunctions(this, "StepFunctions", {
      greetingHandler: lambdaFunctions.greetingHandler,
      responseHandler: lambdaFunctions.responseHandler,
    });

    // Create API Gateway
    const apiGateway = new ApiGateway(this, "ApiGateway", {
      helloFunction: lambdaFunctions.helloFunction,
      deployInstanceFunction: lambdaFunctions.deployInstanceFunction,
      terminateInstanceFunction: lambdaFunctions.terminateInstanceFunction,
      streamingLinkFunction: lambdaFunctions.streamingLinkFunction
    });
  }
}
