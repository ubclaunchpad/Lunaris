import {
    DescribeExecutionCommand,
    DescribeExecutionCommandOutput,
    GetExecutionHistoryCommand,
    SFNClient,
    HistoryEvent,
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
    progress: number; // 0-100 percentage
}

// Extract current step from execution history
const getStepInfoFromHistory = (events: HistoryEvent[], isTerminate: boolean): StepInfo | null => {
    const steps = isTerminate ? TERMINATE_STEPS : DEPLOY_STEPS;
    const totalSteps = steps.length;
    const completedSteps: string[] = [];
    let currentStep = steps[0].name;
    let currentStepName = steps[0].displayName;
    let stepNumber = 1;

    // Process events to find current state
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
            // Execution completed successfully
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
    // Search for failed events (in reverse order to get the most recent)
    for (let i = events.length - 1; i >= 0; i--) {
        const event = events[i];

        if (event.type === "TaskFailed" || event.type === "LambdaFunctionFailed") {
            const details = event.lambdaFunctionFailedEventDetails || event.taskFailedEventDetails;
            return {
                errorStep: "Unknown",
                errorType: (details as any)?.error || "TaskFailed",
                errorMessage: (details as any)?.cause || "Task execution failed",
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

        // Get the step name from the previous TaskStateEntered event
        if (event.type === "TaskStateEntered") {
            const stateDetails = event.stateEnteredEventDetails;
            // Look ahead to see if this task failed
            for (let j = i + 1; j < events.length && j < i + 5; j++) {
                const nextEvent = events[j];
                if (nextEvent.type === "TaskFailed" || nextEvent.type === "LambdaFunctionFailed") {
                    const failDetails =
                        nextEvent.lambdaFunctionFailedEventDetails ||
                        nextEvent.taskFailedEventDetails;
                    return {
                        errorStep: stateDetails?.name || "Unknown",
                        errorType: (failDetails as any)?.error || "TaskFailed",
                        errorMessage: (failDetails as any)?.cause || "Task execution failed",
                    };
                }
            }
        }
    }

    return null;
};

// Helper to map execution status to API response format
const mapExecutionToResponse = async (
    exec: DescribeExecutionCommandOutput,
    runningInstance: Record<string, string>,
): Promise<{ statusCode: number; body: object }> => {
    const status = exec.status || "UNKNOWN";
    const executionArn = exec.executionArn || "";
    const isTerminate = executionArn.includes("Terminate");

    // Get execution history for detailed step info
    let stepInfo: StepInfo | null = null;
    let errorDetails: { errorStep: string; errorType: string; errorMessage: string } | null = null;

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

    switch (status) {
        case "RUNNING":
            return {
                statusCode: 200,
                body: {
                    status: "RUNNING",
                    deploymentStatus: "deploying",
                    message: stepInfo?.currentStepName || "Deployment in progress...",
                    // Enhanced step information
                    currentStep: stepInfo?.currentStep,
                    currentStepName: stepInfo?.currentStepName,
                    stepNumber: stepInfo?.stepNumber,
                    totalSteps: stepInfo?.totalSteps,
                    progress: stepInfo?.progress,
                    completedSteps: stepInfo?.completedSteps,
                    startedAt: exec.startDate?.toISOString(),
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
                    // Enhanced info
                    progress: 100,
                    totalSteps: stepInfo?.totalSteps,
                    completedSteps: stepInfo?.completedSteps,
                    startedAt: exec.startDate?.toISOString(),
                    completedAt: exec.stopDate?.toISOString(),
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
                    error:
                        errorDetails?.errorType ||
                        errorOutput.error ||
                        exec.error ||
                        "DeploymentFailed",
                    message:
                        errorDetails?.errorMessage ||
                        errorOutput.message ||
                        exec.cause ||
                        "Deployment failed",
                    // Enhanced error information
                    errorStep: errorDetails?.errorStep,
                    failedAt: stepInfo?.currentStepName,
                    progress: stepInfo?.progress,
                    stepNumber: stepInfo?.stepNumber,
                    totalSteps: stepInfo?.totalSteps,
                    completedSteps: stepInfo?.completedSteps,
                    startedAt: exec.startDate?.toISOString(),
                    failedAtTime: exec.stopDate?.toISOString(),
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
        const instances = await dbClient.queryByUserId(userId);

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

        const { statusCode, body } = await mapExecutionToResponse(exec, runningInstance);
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
