import { WorkflowConfig } from "../../lib/workflows";
import { Duration } from "aws-cdk-lib";

/**
 * Configuration for the UserTerminateEC2 workflow
 *
 * This workflow orchestrates the EC2 termination process for users by:
 * 1. Checking if there is an active running stream for the user
 * 2. Terminating the EC2 instance if a valid stream exists
 * 3. Updating the running streams table to mark the session as terminated
 */
const config: WorkflowConfig = {
    name: "UserTerminateEC2Workflow",
    description: "Orchestrates user EC2 termination process",
    definitionPath: "user-terminate-ec2/definition.asl.json",
    timeout: Duration.minutes(15),
    lambdaFunctions: {
        checkRunningStreams: {
            functionName: "checkRunningStreamsTerminateFunction",
            placeholder: "${CheckRunningStreamsArn}",
            required: true,
        },
        terminateEC2: {
            functionName: "terminateEC2Function",
            placeholder: "${TerminateEC2Arn}",
            required: true,
        },
        updateRunningStreams: {
            functionName: "updateRunningStreamsTerminateFunction",
            placeholder: "${UpdateRunningStreamsArn}",
            required: true,
        },
    },
    retryConfig: {
        maxAttempts: 3,
        backoffRate: 2.0,
        intervalSeconds: 2,
    },
    errorHandling: {
        catchAll: true,
        customErrorStates: {
            MissingTableNameEnv: "HandleMissingTableName",
            DatabaseError: "HandleDatabaseError",
            InvalidStreamError: "HandleInvalidStreamError",
            TerminationFailedError: "HandleFailedTermination",
        },
    },
};

export default config;
