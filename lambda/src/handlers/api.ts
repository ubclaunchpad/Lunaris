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

// Environment variables
const RUNNING_INSTANCES_TABLE = process.env.RUNNING_INSTANCES_TABLE || "";
const RUNNING_STREAMS_TABLE_NAME = process.env.RUNNING_STREAMS_TABLE_NAME || "";
const USER_DEPLOY_EC2_WORKFLOW_ARN = process.env.USER_DEPLOY_EC2_WORKFLOW_ARN || "";
const TERMINATE_WORKFLOW_ARN = process.env.TERMINATE_WORKFLOW_ARN || "";

interface DeployInstanceRequest {
    userId: string;
}

interface TerminateInstanceRequest {
    userId: string;
    instanceId: string;
}

interface ResponseBody {
    userId?: string;
    error?: string;
    message: string;
    status?: string;
    statusCode?: number;
    sessionId?: string;
    authToken?: string;
    streamingLink?: string;
    dcvUser?: string;
    instanceArn?: string;
    updatedAt?: string;
    [key: string]: unknown; // Allow other properties from streamRecord
}

// Helper function to format responses consistently
const createResponse = (statusCode: number, body: ResponseBody): APIGatewayProxyResult => ({
    statusCode,
    headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(body),
});

// Deploy Instance Handler
const handleDeployInstance = async (
    event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
    try {
        const body: DeployInstanceRequest = JSON.parse(event.body || "{}");
        const { userId } = body;

        if (!RUNNING_INSTANCES_TABLE) {
            throw new Error("MissingRunningInstancesTable");
        }

        if (!userId) {
            return createResponse(400, { message: "User ID is required" });
        }

        // Start the UserDeployEC2 Step Function
        if (!USER_DEPLOY_EC2_WORKFLOW_ARN) {
            return createResponse(500, { message: "UserDeployEC2 Step Function ARN is not set" });
        }

        const stepFunctionInput = {
            userId: userId,
        };

        const executionName = `${userId}-${Date.now()}`;

        const isLocalTesting =
            process.env.NODE_ENV === "local" || process.env.STEPFUNCTIONS_ENDPOINT;
        let executionResponse: StartExecutionCommandOutput;

        if (isLocalTesting && process.env.STEPFUNCTIONS_ENDPOINT) {
            try {
                const startExecutionCommand = new StartExecutionCommand({
                    stateMachineArn: USER_DEPLOY_EC2_WORKFLOW_ARN,
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
                stateMachineArn: USER_DEPLOY_EC2_WORKFLOW_ARN,
                input: JSON.stringify(stepFunctionInput),
                name: executionName,
            });
            executionResponse = await sfnClient.send(startExecutionCommand);
        }

        if (!executionResponse.executionArn) {
            throw new Error("Failed to start UserDeployEC2 Step Function");
        }

        console.log(
            `Started Step Function execution ${executionResponse.executionArn} for user ${userId}`,
        );

        return createResponse(200, {
            status: "success",
            message: "Deployment workflow started successfully",
            statusCode: 200,
        });
    } catch (error) {
        console.error("Error deploying instance:", error);
        return createResponse(500, {
            message: "Failed to deploy instance",
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
};

// Terminate Instance Handler
const handleTerminateInstance = async (
    event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
    try {
        const body: TerminateInstanceRequest = JSON.parse(event.body || "{}");
        const { userId, instanceId } = body;

        // Validate input
        if (!userId) {
            return createResponse(400, {
                status: "error",
                message: "User ID is required",
            });
        }

        if (!instanceId) {
            return createResponse(400, {
                status: "error",
                message: "Instance ID is required",
            });
        }

        // Validate environment variables
        if (!TERMINATE_WORKFLOW_ARN) {
            return createResponse(500, {
                status: "error",
                message: "Internal server error: Step Function configuration missing",
            });
        }

        if (!RUNNING_INSTANCES_TABLE) {
            return createResponse(500, {
                status: "error",
                message: "Internal server error: Database configuration missing",
            });
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
                    return createResponse(409, {
                        status: "error",
                        message: "Termination workflow is already in progress",
                    });
                }

                if (error.name === "StateMachineDoesNotExist") {
                    return createResponse(500, {
                        status: "error",
                        message: "Internal server error: Workflow configuration error",
                    });
                }
            }

            // For other Step Function errors, return expected format
            return createResponse(500, {
                status: "error",
                message: "Failed to start termination workflow",
                error: "Unknown error",
            });
        }

        if (!executionResponse.executionArn) {
            return createResponse(500, {
                status: "error",
                message: "Failed to start termination workflow",
            });
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

        return createResponse(200, {
            status: "success",
            message: "Termination workflow started successfully",
        });
    } catch (error) {
        // Handle JSON parsing errors and other unexpected errors
        console.error("Error terminating instance:", error);

        return createResponse(500, {
            status: "error",
            message: error instanceof Error ? error.message : "Unknown error",
        });
    }
};

// Streaming Link Handler
const handleStreamingLink = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        // Extract and validate userId
        const userId = event.queryStringParameters?.userId;

        if (!userId) {
            return createResponse(400, {
                error: "Bad Request",
                message: "userId query parameter is required",
            });
        }

        console.log(`Querying RunningStreams table for userId: ${userId}`);

        // Query the RunningStreams table by userId using the UserIdIndex
        const { QueryCommand } = await import("@aws-sdk/lib-dynamodb");
        const queryCommand = new QueryCommand({
            TableName: RUNNING_STREAMS_TABLE_NAME,
            IndexName: "UserIdIndex",
            KeyConditionExpression: "userId = :userId",
            ExpressionAttributeValues: {
                ":userId": userId,
            },
        });

        const queryResult = await docClient.send(queryCommand);
        const results = queryResult.Items || [];

        if (results.length === 0) {
            return createResponse(404, {
                error: "Not Found",
                message: `No streaming session found for userId: ${userId}`,
            });
        }

        // Return the most recent entry (first result since sorted by createdAt)
        const streamRecord = results[0];

        console.log(`Found streaming session for userId ${userId}:`, streamRecord);

        // Extract sessionId from streamRecord or generate from userId
        // sessionId is typically the session name created by DCV
        const sessionId = streamRecord.sessionId || `user-${userId}-session`;

        // For DCV Web Client SDK, we can use a simple token or session identifier
        // In this case, we'll use the sessionId as the auth token for self-signed certificates
        const authToken = streamRecord.authToken || sessionId;

        return createResponse(200, {
            message: "Streaming session found",
            ...streamRecord,
            sessionId,
            authToken,
        });
    } catch (error: unknown) {
        if (error instanceof Error) {
            console.error("Error occurred:", error.message);
            console.error("Stack trace:", error.stack);
        }

        return createResponse(500, {
            error: "Internal Server Error",
            message: "An unexpected error occurred while fetching streaming link",
        });
    }
};

// Main handler that routes to the appropriate function
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    console.log("Event:", JSON.stringify(event, null, 2));

    const path = event.resource || event.path;
    const method = event.httpMethod;

    try {
        // Route based on path and method
        if (path === "/deployInstance" && method === "POST") {
            return await handleDeployInstance(event);
        } else if (path === "/terminateInstance" && method === "POST") {
            return await handleTerminateInstance(event);
        } else if (path === "/streamingLink" && method === "GET") {
            return await handleStreamingLink(event);
        } else {
            return createResponse(404, {
                error: "Not Found",
                message: `Route not found: ${method} ${path}`,
            });
        }
    } catch (error) {
        console.error("Unhandled error:", error);
        return createResponse(500, {
            error: "Internal Server Error",
            message: error instanceof Error ? error.message : "Unknown error",
        });
    }
};
