import { Stack, StackProps } from "aws-cdk-lib";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { PolicyStatement, Effect } from "aws-cdk-lib/aws-iam";
import { LambdaFunctions } from "./constructs/lambda-functions";
import { StepFunctions } from "./constructs/step-functions";
import { ApiGateway } from "./constructs/api-gateway";
import { DynamoDbTables } from "./constructs/dynamodb-tables";
import { CognitoUserPool } from "./constructs/cognito-user-pool";
import { EC2InstanceRole } from "./constructs/ec2-instance-role";

export class CdkStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, {
            ...props,
            env: {
                account: process.env.CDK_DEFAULT_ACCOUNT,
                region: process.env.CDK_DEFAULT_REGION,
            },
        });

        // Create Cognito User Pool
        const cognitoUserPool = new CognitoUserPool(this, "CognitoUserPool");

        // Create DynamoDB tables
        const dynamoDbTables = new DynamoDbTables(this, "DynamoDbTables");

        // Create EC2 Instance Role for DCV instances (enables SSM access)
        const ec2InstanceRole = new EC2InstanceRole(this, "EC2InstanceRole");

        // Create API Lambda functions
        const lambdaFunctions = new LambdaFunctions(this, "LambdaFunctions", {
            runningInstancesTable: dynamoDbTables.runningInstancesTable,
            runningStreamsTable: dynamoDbTables.runningStreamsTable,
            ec2InstanceProfileArn: ec2InstanceRole.instanceProfileArn,
            ec2InstanceProfileName: ec2InstanceRole.instanceProfileName,
        });

        // Grant EC2 permissions to unified API Lambda
        lambdaFunctions.apiFunction.addToRolePolicy(
            new PolicyStatement({
                actions: ["ec2:RunInstances", "ec2:CreateTags", "ec2:DescribeInstances"],
                resources: [`arn:aws:ec2:${this.region}:${this.account}:subnet/subnet-12345678`],
            }),
        );

        // Grant DynamoDB permissions to unified API Lambda
        dynamoDbTables.runningInstancesTable.grantReadWriteData(lambdaFunctions.apiFunction);
        dynamoDbTables.runningStreamsTable.grantReadData(lambdaFunctions.apiFunction);

        // Grant DynamoDB permissions for workflow Lambda functions
        dynamoDbTables.runningInstancesTable.grantReadWriteData(lambdaFunctions.deployEC2Function);
        dynamoDbTables.runningStreamsTable.grantReadData(
            lambdaFunctions.checkRunningStreamsFunction,
        );
        dynamoDbTables.runningStreamsTable.grantWriteData(
            lambdaFunctions.updateRunningStreamsFunction,
        );

        // Grant DynamoDB permissions for UserTerminateEC2 workflow
        dynamoDbTables.runningStreamsTable.grantReadData(
            lambdaFunctions.checkRunningStreamsTerminateFunction,
        );
        dynamoDbTables.runningInstancesTable.grantReadWriteData(
            lambdaFunctions.terminateEC2Function,
        );
        dynamoDbTables.runningStreamsTable.grantWriteData(
            lambdaFunctions.updateRunningStreamsTerminateFunction,
        );

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

        // Get UserTerminateEC2Workflow
        const terminateWorkflow = stepFunctions.getWorkflow("UserTerminateEC2Workflow");
        if (!terminateWorkflow) {
            throw new Error("UserTerminateEC2Workflow not found");
        }

        // Get UserDeployEC2Workflow
        const deployWorkflow = stepFunctions.getWorkflow("UserDeployEC2Workflow");
        if (!deployWorkflow) {
            throw new Error("UserDeployEC2Workflow not found");
        }

        // Grant step functions permissions to unified API Lambda
        lambdaFunctions.apiFunction.addToRolePolicy(
            new PolicyStatement({
                effect: Effect.ALLOW,
                actions: ["states:StartExecution"],
                resources: [terminateWorkflow.stateMachineArn, deployWorkflow.stateMachineArn],
            }),
        );

        // Add Step Function ARNs as environment variables to unified API Lambda
        lambdaFunctions.apiFunction.addEnvironment(
            "TERMINATE_WORKFLOW_ARN",
            terminateWorkflow.stateMachineArn,
        );
        lambdaFunctions.apiFunction.addEnvironment(
            "USER_DEPLOY_EC2_WORKFLOW_ARN",
            deployWorkflow.stateMachineArn,
        );

        // Grant EC2 termination permissions to terminateEC2Function
        lambdaFunctions.terminateEC2Function.addToRolePolicy(
            new PolicyStatement({
                actions: ["ec2:TerminateInstances", "ec2:DescribeInstances"],
                resources: ["*"],
            }),
        );

        // Create API Gateway without Cognito authorizer (for testing)
        // To enable authentication, pass: userPool: cognitoUserPool.userPool
        const apiGateway = new ApiGateway(this, "ApiGateway", {
            apiFunction: lambdaFunctions.apiFunction,
            // userPool: cognitoUserPool.userPool, // Commented out for testing without auth
        });
    }
}
