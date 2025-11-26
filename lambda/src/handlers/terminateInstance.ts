import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
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

interface TerminateInstanceRequest {
    userId: string;
    instanceId: string;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        const body: TerminateInstanceRequest = JSON.parse(event.body || "{}");
        const { userId, instanceId } = body;

        // Validate input
        if (!userId) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    status: "error",
                    message: "User ID is required",
                }),
            };
        }

        if (!instanceId) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    status: "error",
                    message: "Instance ID is required",
                }),
            };
        }

        // Read environment variables inside handler (not at module load time)
        const TERMINATE_WORKFLOW_ARN = process.env.TERMINATE_WORKFLOW_ARN || "";
        const RUNNING_INSTANCES_TABLE = process.env.RUNNING_INSTANCES_TABLE || "";

        // Validate environment variables
        if (!TERMINATE_WORKFLOW_ARN) {
            return {
                statusCode: 500,
                body: JSON.stringify({
                    status: "error",
                    message: "Internal server error: Step Function configuration missing",
                }),
            };
        }

        if (!RUNNING_INSTANCES_TABLE) {
            return {
                statusCode: 500,
                body: JSON.stringify({
                    status: "error",
                    message: "Internal server error: Database configuration missing",
                }),
            };
        }

        // Start the UserTerminateEC2 Step Function
        const stepFunctionInput = {
            userId: userId,
        };

        const executionName = `${userId}-${Date.now()}`;

        let executionResponse: StartExecutionCommandOutput;

        try {
            const startExecutionCommand = new StartExecutionCommand({
                stateMachineArn: TERMINATE_WORKFLOW_ARN,
                input: JSON.stringify(stepFunctionInput),
                name: executionName,
            });
            executionResponse = await sfnClient.send(startExecutionCommand);
        } catch (error) {
            // Handle specific Step Function errors
            if (error instanceof Error) {
                if (error.name === "ExecutionAlreadyExists") {
                    return {
                        statusCode: 409,
                        body: JSON.stringify({
                            status: "error",
                            message: "Termination workflow is already in progress",
                        }),
                    };
                }

                if (error.name === "StateMachineDoesNotExist") {
                    return {
                        statusCode: 500,
                        body: JSON.stringify({
                            status: "error",
                            message: "Internal server error: Workflow configuration error",
                        }),
                    };
                }
            }

            // For other Step Function errors, return expected format
            return {
                statusCode: 500,
                body: JSON.stringify({
                    status: "error",
                    message: "Failed to start termination workflow",
                    error: "Unknown error",
                }),
            };
        }

        if (!executionResponse.executionArn) {
            return {
                statusCode: 500,
                body: JSON.stringify({
                    status: "error",
                    message: "Failed to start termination workflow",
                }),
            };
        }

        // Update DynamoDB with execution ARN and status
        // This should not fail the request if it errors (Step Function already started)
        const timestamp = new Date().toISOString();
        try {
            const updateCommand = new UpdateCommand({
                TableName: RUNNING_INSTANCES_TABLE,
                Key: {
                    instanceId: instanceId,
                },
                UpdateExpression:
                    "SET executionArn = :arn, #status = :status, lastModifiedTime = :timestamp",
                ExpressionAttributeNames: {
                    "#status": "status",
                },
                ExpressionAttributeValues: {
                    ":arn": executionResponse.executionArn,
                    ":status": "terminating",
                    ":timestamp": timestamp,
                },
            });

            await docClient.send(updateCommand);
            console.log(
                `Updated DynamoDB with execution ARN: ${executionResponse.executionArn} for instance ${instanceId}`,
            );
        } catch (dbError) {
            // Log error but don't fail the request since Step Function was already started
            console.error("Failed to update DynamoDB:", dbError);
        }

        console.log(
            `Started Step Function execution ${executionResponse.executionArn} for user ${userId}`,
        );

        return {
            statusCode: 200,
            body: JSON.stringify({
                status: "success",
                message: "Termination workflow started successfully",
            }),
        };
    } catch (error) {
        // Handle JSON parsing errors and other unexpected errors
        console.error("Error terminating instance:", error);

        return {
            statusCode: 500,
            body: JSON.stringify({
                status: "error",
                message: error instanceof Error ? error.message : "Unknown error",
            }),
        };
    }
};
