import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import {
    SFNClient,
    StartExecutionCommand,
    StartExecutionCommandOutput,
    DescribeExecutionCommand,
    GetExecutionHistoryCommand,
    HistoryEvent,
    TaskFailedEventDetails,
    LambdaFunctionFailedEventDetails,
} from "@aws-sdk/client-sfn";

interface EventDetails {
    error?: string;
    cause?: string;
}
import { SFNClientConfig } from "@aws-sdk/client-sfn";
import { DynamoDBClientConfig } from "@aws-sdk/client-dynamodb";
import DynamoDBWrapper from "../utils/dynamoDbWrapper";

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

        // Store execution ARN in DynamoDB immediately so we can track the deployment status
        // Use a placeholder instanceId based on the execution name until the real instance is created
        const placeholderInstanceId = `pending-${executionName}`;
        const now = new Date().toISOString();

        try {
            const putCommand = new PutCommand({
                TableName: RUNNING_INSTANCES_TABLE,
                Item: {
                    instanceId: placeholderInstanceId,
                    userId: userId,
                    executionArn: executionResponse.executionArn,
                    status: "deploying",
                    creationTime: now, // Match GSI sort key name
                    lastModifiedTime: now,
                },
            });
            await docClient.send(putCommand);
            console.log(`Stored execution tracking record for user ${userId}`);
        } catch (dbError) {
            console.error("Failed to store execution ARN in DynamoDB:", dbError);
            // Don't fail the request - the Step Function has already started
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

        // Extract connection details
        const dcvHost = streamRecord.dcvIp;
        const dcvPort = streamRecord.dcvPort || 8443;
        const dcvUser = streamRecord.dcvUser || "Administrator";
        const dcvPassword = streamRecord.dcvPassword;

        // Use nip.io domain for valid SSL certificates (fallback if not stored)
        const nipDomain = dcvHost ? dcvHost.replace(/\./g, "-") + ".nip.io" : "";
        const streamingLink = streamRecord.streamingLink || `https://${nipDomain}:${dcvPort}`;

        // Session ID for DCV connection (default console session)
        const sessionId = "console";

        // Return session info WITH password for MVP
        // NOTE: In production, implement proper token-based auth via DCV Session Connection Broker
        // For MVP, the DCV Web SDK requires credentials for WebSocket authentication
        return createResponse(200, {
            message: "Streaming session found",
            userId: streamRecord.userId,
            instanceId: streamRecord.instanceId,
            instanceArn: streamRecord.instanceArn,
            streamingLink,
            dcvIp: dcvHost,
            dcvPort,
            dcvUser,
            dcvPassword, // Included for MVP - DCV SDK requires credentials
            sessionId,
            createdAt: streamRecord.createdAt,
            updatedAt: streamRecord.updatedAt,
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

// ============================================================================
// Deployment Status Handler
// ============================================================================

// Define workflow steps for deploy and terminate workflows
const DEPLOY_STEPS = [
    { name: "CheckRunningStreams", displayName: "Checking existing streams", order: 1 },
    { name: "CheckIfValidStream", displayName: "Validating stream status", order: 2 },
    { name: "DeployEC2", displayName: "Deploying EC2 instance", order: 3 },
    { name: "WaitForInstanceReady", displayName: "Waiting for instance to be ready", order: 4 },
    { name: "ConfigureDcvInstance", displayName: "Configuring DCV session", order: 5 },
    { name: "UpdateRunningStreams", displayName: "Updating streaming database", order: 6 },
    { name: "DeploymentSuccess", displayName: "Deployment complete", order: 7 },
];

const TERMINATE_STEPS = [
    { name: "CheckRunningStreams", displayName: "Checking running streams", order: 1 },
    { name: "TerminateEC2", displayName: "Terminating EC2 instance", order: 2 },
    { name: "UpdateRunningStreams", displayName: "Updating streaming database", order: 3 },
    { name: "TerminationSuccess", displayName: "Termination complete", order: 4 },
];

interface StepInfo {
    currentStep: string;
    currentStepName: string;
    stepNumber: number;
    totalSteps: number;
    completedSteps: string[];
    progress: number;
}

// Extract current step from execution history
const getStepInfoFromHistory = (events: HistoryEvent[], isTerminate: boolean): StepInfo | null => {
    const steps = isTerminate ? TERMINATE_STEPS : DEPLOY_STEPS;
    const totalSteps = steps.length;
    const completedSteps: string[] = [];
    let currentStep = steps[0].name;
    let currentStepName = steps[0].displayName;
    let stepNumber = 1;

    for (const event of events) {
        if (event.type === "TaskStateEntered" || event.type === "WaitStateEntered") {
            const details = event.stateEnteredEventDetails;
            if (details?.name) {
                currentStep = details.name;
                const stepInfo = steps.find((s) => s.name === details.name);
                if (stepInfo) {
                    currentStepName = stepInfo.displayName;
                    stepNumber = stepInfo.order;
                }
            }
        } else if (event.type === "TaskStateExited" || event.type === "WaitStateExited") {
            const details = event.stateExitedEventDetails;
            if (details?.name && !completedSteps.includes(details.name)) {
                completedSteps.push(details.name);
            }
        } else if (event.type === "ExecutionSucceeded") {
            const lastStep = steps[steps.length - 1];
            return {
                currentStep: lastStep.name,
                currentStepName: lastStep.displayName,
                stepNumber: totalSteps,
                totalSteps,
                completedSteps: steps.map((s) => s.name),
                progress: 100,
            };
        }
    }

    const progress = Math.round((completedSteps.length / totalSteps) * 100);

    return {
        currentStep,
        currentStepName,
        stepNumber,
        totalSteps,
        completedSteps,
        progress,
    };
};

// Extract error details from execution history
const getErrorDetails = (
    events: HistoryEvent[],
): { errorStep: string; errorType: string; errorMessage: string } | null => {
    for (let i = events.length - 1; i >= 0; i--) {
        const event = events[i];

        if (event.type === "TaskFailed" || event.type === "LambdaFunctionFailed") {
            const details: TaskFailedEventDetails | LambdaFunctionFailedEventDetails | undefined =
                event.lambdaFunctionFailedEventDetails || event.taskFailedEventDetails;
            return {
                errorStep: "Unknown",
                errorType: details?.error || "TaskFailed",
                errorMessage: details?.cause || "Task execution failed",
            };
        }

        if (event.type === "ExecutionFailed") {
            const details = event.executionFailedEventDetails;
            return {
                errorStep: "Execution",
                errorType: details?.error || "ExecutionFailed",
                errorMessage: details?.cause || "Execution failed",
            };
        }

        if (event.type === "TaskStateEntered") {
            const stateDetails = event.stateEnteredEventDetails;
            for (let j = i + 1; j < events.length && j < i + 5; j++) {
                const nextEvent = events[j];
                if (nextEvent.type === "TaskFailed" || nextEvent.type === "LambdaFunctionFailed") {
                    const failDetails:
                        | TaskFailedEventDetails
                        | LambdaFunctionFailedEventDetails
                        | undefined =
                        nextEvent.lambdaFunctionFailedEventDetails ||
                        nextEvent.taskFailedEventDetails;
                    return {
                        errorStep: stateDetails?.name || "Unknown",
                        errorType: failDetails?.error || "TaskFailed",
                        errorMessage: failDetails?.cause || "Task execution failed",
                    };
                }
            }
        }
    }

    return null;
};

// Deployment Status Handler
const handleDeploymentStatus = async (
    event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
    try {
        const userId = event.queryStringParameters?.userId;

        if (!userId) {
            return createResponse(400, {
                error: "BadRequest",
                message: "userId query parameter is required",
            });
        }

        const dbWrapper = new DynamoDBWrapper(RUNNING_INSTANCES_TABLE);
        const instances = await dbWrapper.queryByUserId(userId);

        if (!instances || instances.length === 0) {
            return createResponse(404, {
                error: "NotFound",
                message: `No running instance found for userId: ${userId}`,
                status: "NOT_FOUND",
            });
        }

        const runningInstance = instances[0];

        if (!runningInstance.executionArn) {
            return createResponse(404, {
                error: "NotFound",
                message: `No active deployment found for userId: ${userId}`,
                status: "NOT_FOUND",
            });
        }

        const execCommand = new DescribeExecutionCommand({
            executionArn: runningInstance.executionArn,
        });

        const exec = await sfnClient.send(execCommand);
        const executionArn = exec.executionArn || "";
        const isTerminate = executionArn.includes("Terminate");
        const status = exec.status || "UNKNOWN";

        // Get execution history for detailed step info
        let stepInfo: StepInfo | null = null;
        let errorDetails: { errorStep: string; errorType: string; errorMessage: string } | null =
            null;

        try {
            const historyCommand = new GetExecutionHistoryCommand({
                executionArn: exec.executionArn,
                maxResults: 100,
                reverseOrder: false,
            });
            const historyResult = await sfnClient.send(historyCommand);
            const events = historyResult.events || [];

            stepInfo = getStepInfoFromHistory(events, isTerminate);

            if (status === "FAILED" || status === "TIMED_OUT" || status === "ABORTED") {
                errorDetails = getErrorDetails(events);
            }
        } catch (historyError) {
            console.warn("Failed to get execution history:", historyError);
        }

        // Build response based on status
        switch (status) {
            case "RUNNING":
                return createResponse(200, {
                    status: "RUNNING",
                    message:
                        stepInfo?.currentStepName ||
                        (isTerminate ? "Termination in progress..." : "Deployment in progress..."),
                    deploymentStatus: isTerminate ? "terminating" : "deploying",
                    currentStep: stepInfo?.currentStep,
                    currentStepName: stepInfo?.currentStepName,
                    stepNumber: stepInfo?.stepNumber,
                    totalSteps: stepInfo?.totalSteps,
                    progress: stepInfo?.progress,
                    completedSteps: stepInfo?.completedSteps,
                    startedAt: exec.startDate?.toISOString(),
                });

            case "SUCCEEDED":
                const output = exec.output ? JSON.parse(exec.output) : {};

                if (isTerminate) {
                    return createResponse(200, {
                        status: "SUCCEEDED",
                        message: "Instance has been terminated",
                        deploymentStatus: "terminated",
                        instanceId: output.instanceId || runningInstance.instanceId,
                        progress: 100,
                        totalSteps: stepInfo?.totalSteps,
                        completedSteps: stepInfo?.completedSteps,
                        startedAt: exec.startDate?.toISOString(),
                        completedAt: exec.stopDate?.toISOString(),
                    });
                }

                return createResponse(200, {
                    status: "SUCCEEDED",
                    message: "Instance is ready for streaming",
                    deploymentStatus: "running",
                    instanceId: output.instanceId || runningInstance.instanceId,
                    dcvUrl: output.dcvUrl,
                    progress: 100,
                    totalSteps: stepInfo?.totalSteps,
                    completedSteps: stepInfo?.completedSteps,
                    startedAt: exec.startDate?.toISOString(),
                    completedAt: exec.stopDate?.toISOString(),
                });

            case "FAILED":
            case "TIMED_OUT":
            case "ABORTED":
                const errorOutput = exec.output ? JSON.parse(exec.output) : {};
                return createResponse(200, {
                    status: "FAILED",
                    message:
                        errorDetails?.errorMessage ||
                        errorOutput.message ||
                        exec.cause ||
                        "Deployment failed",
                    error:
                        errorDetails?.errorType ||
                        errorOutput.error ||
                        exec.error ||
                        "DeploymentFailed",
                    errorStep: errorDetails?.errorStep,
                    failedAt: stepInfo?.currentStepName,
                    progress: stepInfo?.progress,
                    stepNumber: stepInfo?.stepNumber,
                    totalSteps: stepInfo?.totalSteps,
                    completedSteps: stepInfo?.completedSteps,
                    startedAt: exec.startDate?.toISOString(),
                    failedAtTime: exec.stopDate?.toISOString(),
                });

            default:
                return createResponse(200, {
                    status: "UNKNOWN",
                    message: `Unknown execution status: ${status}`,
                });
        }
    } catch (error: unknown) {
        console.error("Error in handleDeploymentStatus:", error);
        if (error instanceof Error) {
            return createResponse(500, {
                error: error.name,
                message: error.message,
                status: "FAILED",
            });
        }
        return createResponse(500, {
            error: "UnknownError",
            message: "An unknown error occurred",
            status: "FAILED",
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
        } else if (path === "/deployment-status" && method === "GET") {
            return await handleDeploymentStatus(event);
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
