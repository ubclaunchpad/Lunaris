import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

import { SFNClient, StartExecutionCommand, StartExecutionCommandOutput } from "@aws-sdk/client-sfn";
import { SFNClientConfig } from "@aws-sdk/client-sfn";
import { DynamoDBClientConfig } from "@aws-sdk/client-dynamodb";

// Configure clients to use local endpoints when available (for local testing)
const sfnClientConfig: Partial<SFNClientConfig> = {};
const dynamoClientConfig: Partial<DynamoDBClientConfig> = {};

if (process.env.STEPFUNCTIONS_ENDPOINT) {
    sfnClientConfig.endpoint = process.env.STEPFUNCTIONS_ENDPOINT;
}

if (process.env.DYNAMODB_ENDPOINT) {
    dynamoClientConfig.endpoint = process.env.DYNAMODB_ENDPOINT;
}

const sfnClient = new SFNClient(sfnClientConfig);
const dynamoClient = new DynamoDBClient(dynamoClientConfig);
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const RUNNING_INSTANCES_TABLE = process.env.RUNNING_INSTANCES_TABLE || "";
const STEP_FUNCTION_ARN = process.env.USER_DEPLOY_EC2_WORKFLOW_ARN || "";

interface DeployInstanceRequest {
    userId: string;
    instanceType?: string;
    amiId?: string;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        const body: DeployInstanceRequest = JSON.parse(event.body || "{}");
        const { userId, instanceType = "t3.micro", amiId } = body;

        const runningInstancesTable = process.env.RUNNING_INSTANCES_TABLE;
        if (!runningInstancesTable) {
            throw new Error("MissingRunningInstancesTable");
        }

        if (!userId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: "User ID is required" }),
            };
        }

        if (!amiId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: "AMI ID is required" }),
            };
        }

        // Start the UserDeployEC2 Step Function
        if (!STEP_FUNCTION_ARN) {
            return {
                statusCode: 500,
                body: JSON.stringify({ message: "UserDeployEC2 Step Function ARN is not set" }),
            };
        }

        const stepFunctionInput = {
            userId: userId,
            instanceType: instanceType,
            amiId: amiId,
        };

        const executionName = `${userId}-${Date.now()}`;

        const isLocalTesting =
            process.env.NODE_ENV === "local" || process.env.STEPFUNCTIONS_ENDPOINT;
        let executionResponse: StartExecutionCommandOutput;

        if (isLocalTesting && process.env.STEPFUNCTIONS_ENDPOINT) {
            try {
                const startExecutionCommand = new StartExecutionCommand({
                    stateMachineArn: STEP_FUNCTION_ARN,
                    input: JSON.stringify(stepFunctionInput),
                    name: executionName,
                });
                executionResponse = await sfnClient.send(startExecutionCommand);
                console.log("Step Function execution started via local endpoint");
            } catch (error) {
                console.log(
                    "Local Step Functions endpoint not available, using mock execution ARN",
                );
                const mockExecutionArn = `arn:aws:states:us-east-1:123456789012:execution:UserDeployEC2Workflow:${executionName}`;
                executionResponse = {
                    executionArn: mockExecutionArn,
                    startDate: new Date(),
                    $metadata: {},
                } as StartExecutionCommandOutput;
            }
        } else {
            const startExecutionCommand = new StartExecutionCommand({
                stateMachineArn: STEP_FUNCTION_ARN,
                input: JSON.stringify(stepFunctionInput),
                name: executionName,
            });
            executionResponse = await sfnClient.send(startExecutionCommand);
        }

        if (!executionResponse.executionArn) {
            throw new Error("Failed to start UserDeployEC2 Step Function");
        }

        const now = new Date().toISOString();

        // Log to RunningInstances table
        if (RUNNING_INSTANCES_TABLE) {
            try {
                const putCommand = new PutCommand({
                    TableName: RUNNING_INSTANCES_TABLE,
                    Item: {
                        userId: userId,
                        executionArn: executionResponse.executionArn,
                        status: "RUNNING",
                        createdAt: now,
                        instanceType: instanceType,
                        amiId: amiId,
                    },
                });

                await docClient.send(putCommand);
                console.log(`Stored execution ARN in DynamoDB: ${executionResponse.executionArn}`);
            } catch (dbError) {
                if (isLocalTesting) {
                    console.warn(
                        "DynamoDB not available in local testing, skipping storage:",
                        dbError,
                    );
                } else {
                    throw dbError;
                }
            }
        }

        console.log(
            `Started Step Function execution ${executionResponse.executionArn} for user ${userId}`,
        );

        return {
            statusCode: 200,
            body: JSON.stringify({
                status: "success",
                message: "Deployment workflow started successfully",
                statusCode: 200,
            }),
        };
    } catch (error) {
        console.error("Error deploying instance:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: "Failed to deploy instance",
                error: error instanceof Error ? error.message : "Unknown error",
            }),
        };
    }
};
