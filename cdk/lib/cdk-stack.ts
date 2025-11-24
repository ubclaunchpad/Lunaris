import { Stack, StackProps } from "aws-cdk-lib";
import * as cdk from "aws-cdk-lib";
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

        // Create API Lambda functions
        const lambdaFunctions = new LambdaFunctions(this, "LambdaFunctions", {
            runningInstancesTable: dynamoDbTables.getRunningInstanceTable(),
            runningStreamsTable: dynamoDbTables.getRunningStreamsTable(),
        });

        // Grant EC2 permissions to deployInstance Lambda
        lambdaFunctions.deployInstanceFunction.addToRolePolicy(
            new PolicyStatement({
                actions: ["ec2:RunInstances", "ec2:CreateTags", "ec2:DescribeInstances"],
                resources: [`arn:aws:ec2:${this.region}:${this.account}:subnet/subnet-12345678`],
            }),
        );

        lambdaFunctions.deploymentStatusFunction.addToRolePolicy(
            new PolicyStatement({
                actions: ["states:DescribeExecution"],
                resources: ["*"],
            }),
        );

        // Grant DynamoDB permissions
        dynamoDbTables
            .getRunningInstanceTable()
            .grantWriteData(lambdaFunctions.deployInstanceFunction);
        dynamoDbTables
            .getRunningInstanceTable()
            .grantReadData(lambdaFunctions.deploymentStatusFunction);
        dynamoDbTables
            .getRunningInstanceTable()
            .grantReadWriteData(lambdaFunctions.deployEC2Function);
        dynamoDbTables
            .getRunningStreamsTable()
            .grantReadData(lambdaFunctions.checkRunningStreamsFunction);
        dynamoDbTables
            .getRunningStreamsTable()
            .grantWriteData(lambdaFunctions.updateRunningStreamsFunction);

        // Grant DynamoDB permissions for UserTerminateEC2 workflow
        dynamoDbTables
            .getRunningStreamsTable()
            .grantReadData(lambdaFunctions.checkRunningStreamsTerminateFunction);
        dynamoDbTables
            .getRunningInstanceTable()
            .grantReadWriteData(lambdaFunctions.terminateEC2Function);
        dynamoDbTables
            .getRunningStreamsTable()
            .grantWriteData(lambdaFunctions.updateRunningStreamsTerminateFunction);

        // Create Step Functions with consistent naming and tagging
        const stepFunctions = new StepFunctions(this, "StepFunctions", {
            checkRunningStreamsFunction: lambdaFunctions.checkRunningStreamsFunction,
            deployEC2Function: lambdaFunctions.deployEC2Function,
            updateRunningStreamsFunction: lambdaFunctions.updateRunningStreamsFunction,
            checkRunningStreamsTerminateFunction:
                lambdaFunctions.checkRunningStreamsTerminateFunction,
            terminateEC2Function: lambdaFunctions.terminateEC2Function,
            updateRunningStreamsTerminateFunction:
                lambdaFunctions.updateRunningStreamsTerminateFunction,
        });

        // Apply consistent tags to Step Functions resources
        cdk.Tags.of(stepFunctions).add("Component", "StepFunctions");
        cdk.Tags.of(stepFunctions).add("ManagedBy", "CDK");

        const userDeployEC2Workflow = stepFunctions.getWorkflow("UserDeployEC2Workflow");
        if (!userDeployEC2Workflow) {
            throw new Error("UserDeployEC2Workflow not found");
        }

        // Create API Gateway
        new ApiGateway(this, "ApiGateway", {
            deployInstanceFunction: lambdaFunctions.deployInstanceFunction,
            terminateInstanceFunction: lambdaFunctions.terminateInstanceFunction,
            streamingLinkFunction: lambdaFunctions.streamingLinkFunction,
        });
    }
}
