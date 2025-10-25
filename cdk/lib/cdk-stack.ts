import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { LambdaFunctions } from "./constructs/lambda-functions";
import { StepFunctions } from "./constructs/step-functions";
import { ApiGateway } from "./constructs/api-gateway";
import { DynamoDbTables } from "./constructs/dynamodb-tables";

export class CdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Create Lambda functions
    const lambdaFunctions = new LambdaFunctions(this, "LambdaFunctions");

    // Create DynamoDB tables
    const dynamoDbTables = new DynamoDbTables(this, "DynamoDbTables");

    // Create Step Functions
    const stepFunctions = new StepFunctions(this, "StepFunctions", {
      greetingHandler: lambdaFunctions.greetingHandler,
      responseHandler: lambdaFunctions.responseHandler,
      checkRunningStreamsFunction: lambdaFunctions.checkRunningStreamsFunction,
      deployEC2Function: lambdaFunctions.deployEC2Function,
      updateRunningStreamsFunction: lambdaFunctions.updateRunningStreamsFunction,
    });

    // Create API Gateway
    const apiGateway = new ApiGateway(this, "ApiGateway", {
      helloFunction: lambdaFunctions.helloFunction,
      deployInstanceFunction: lambdaFunctions.deployInstanceFunction,
      terminateInstanceFunction: lambdaFunctions.terminateInstanceFunction,
      streamingLinkFunction: lambdaFunctions.streamingLinkFunction,
    });
  }
}
