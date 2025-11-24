import {
    DescribeExecutionCommand,
    DescribeExecutionCommandOutput,
    SFNClient,
} from "@aws-sdk/client-sfn";
import { APIGatewayProxyHandler, APIGatewayProxyResult } from "aws-lambda";
import DynamoDBWrapper from "../utils/dynamoDbWrapper";

const sfnClient = new SFNClient({});
const dbClient = new DynamoDBWrapper(process.env.RUNNING_INSTANCES_TABLE || "RunningInstances");

const createResponse = (statusCode: number, body: object): APIGatewayProxyResult => ({
    statusCode,
    headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(body),
});

// Helper to map execution status to API response format
const mapExecutionToResponse = (
    exec: DescribeExecutionCommandOutput,
    runningInstance: Record<string, string>,
): { statusCode: number; body: object } => {
    const status = exec.status || "UNKNOWN";

    switch (status) {
        case "RUNNING":
            return {
                statusCode: 200,
                body: {
                    status: "RUNNING",
                    deploymentStatus: "deploying",
                    message: "Deployment in progress...",
                },
            };

        case "SUCCEEDED":
            const output = exec.output ? JSON.parse(exec.output) : {};
            return {
                statusCode: 200,
                body: {
                    status: "SUCCEEDED",
                    deploymentStatus: "running",
                    instanceId: output.instanceId || runningInstance.instanceId,
                    dcvUrl: output.dcvUrl,
                    message: "Instance is ready for streaming",
                },
            };

        case "FAILED":
        case "TIMED_OUT":
        case "ABORTED":
            const errorOutput = exec.output ? JSON.parse(exec.output) : {};
            return {
                statusCode: 200,
                body: {
                    status: "FAILED",
                    error: errorOutput.error || exec.error || "DeploymentFailed",
                    message: errorOutput.message || exec.cause || "Deployment failed",
                },
            };

        default:
            return {
                statusCode: 200,
                body: {
                    status: "UNKNOWN",
                    message: `Unknown execution status: ${status}`,
                },
            };
    }
};

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        const userId = event.queryStringParameters?.userId;

        // invalid userId
        if (!userId) {
            return createResponse(400, {
                status: "FAILED",
                message: "userId query parameter is required",
            });
        }
        // fetch the latest runtime instance for the user
        const instances = await dbClient.queryItemsByUserId(userId);

        if (!instances || instances.length === 0) {
            return createResponse(404, {
                status: "NOT_FOUND",
                message: `No running instance found for userId: ${userId}`,
            });
        }

        const runningInstance = instances[0];

        if (!runningInstance.executionArn) {
            return createResponse(404, {
                status: "NOT_FOUND",
                message: `No active deployment found for userId: ${userId}`,
            });
        }

        const command = new DescribeExecutionCommand({
            executionArn: runningInstance.executionArn,
        });

        const exec = await sfnClient.send(command);

        const { statusCode, body } = mapExecutionToResponse(exec, runningInstance);
        return createResponse(statusCode, body);
    } catch (error: unknown) {
        if (error instanceof Error) {
            return createResponse(500, {
                status: "FAILED",
                error: error.name,
                message: error.message,
            });
        }
        return createResponse(500, {
            status: "FAILED",
            error: "UnknownError",
            message: "An unknown error occurred",
        });
    }
};
