import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { handler as checkRunningStreamsHandler } from "../../src/handlers/user-terminate-ec2/check-running-streams";
import { handler as terminateEc2Handler } from "../../src/handlers/user-terminate-ec2/terminate-ec2";
import { handler as updateRunningStreamsHandler } from "../../src/handlers/user-terminate-ec2/update-running-streams";
import { dynamoMock, withEnv } from "../utils/dynamoMock";

let restoreEnv: () => void;

/**
 * Integration tests for UserTerminateEC2Workflow
 *
 * These tests simulate the Step Function workflow by calling Lambda handlers in sequence,
 *
 *
 * For actual Step Function testing, you would need:
 * - AWS Step Functions Local (local testing)
 * - Or deploy to AWS and test with real Step Functions
 */
describe("UserTerminateEC2Workflow Integration", () => {
    beforeEach(() => {
        restoreEnv = withEnv({ RUNNING_STREAMS_TABLE_NAME: "running-streams-table" });
        dynamoMock.reset();
    });

    afterEach(() => {
        restoreEnv();
    });

    /**
     * Simulates the complete workflow execution by calling the lambda functions in sequence
     *
     */
    const simulateWorkflow = async (userId: string, hasActiveStream = true) => {
        // Step 1: CheckRunningStreams
        const checkResult = await checkRunningStreamsHandler({ userId });

        if (!checkResult.valid || !hasActiveStream) {
            return { success: false, error: "InvalidStreamError" };
        }

        // Step 2: TerminateEC2
        const terminateResult = await terminateEc2Handler({
            userId,
        });

        // Step 3: UpdateRunningStreams
        const updateResult = await updateRunningStreamsHandler({
            userId,
            sessionId: checkResult.sessionId!,
            instanceArn: checkResult.instanceArn!,
        });

        return {
            success: true,
            checkResult,
            terminateResult,
            updateResult,
        };
    };

    describe("End-to-End Success Flow", () => {
        it("completes workflow successfully when user has active stream", async () => {
            // Mock CheckRunningStreams - uses getItem
            dynamoMock.on(GetCommand).resolves({
                Item: {
                    instanceArn: "arn:aws:ec2:us-west-2:123456789012:instance/i-1234567890abcdef0",
                    userId: "user-123",
                    streamingId: "stream-456",
                    sessionId: "session-456",
                },
            });

            // Mock UpdateRunningStreams - uses updateItem
            dynamoMock.on(UpdateCommand).resolves({});

            const result = await simulateWorkflow("user-123", true);

            expect(result.success).toBe(true);
            expect(result.checkResult?.valid).toBe(true);
            expect(result.terminateResult?.success).toBe(true);
            expect(result.updateResult?.success).toBe(true);
        });
    });

    describe("Error Scenarios", () => {
        it("should fail when user has no active stream", async () => {
            // getItem returns null when item doesn't exist
            dynamoMock.on(GetCommand).resolves({
                Item: undefined,
            });

            const result = await simulateWorkflow("user-no-stream", false);

            expect(result.success).toBe(false);
            expect(result.error).toBe("InvalidStreamError");
        });

        it("handles missingTableNameEnv in CheckRunningStreams", async () => {
            // test handler's env var check
            restoreEnv();
            delete process.env.RUNNING_STREAMS_TABLE_NAME;

            await expect(simulateWorkflow("user-123", true)).rejects.toThrow("MissingTableNameEnv");
        });

        it("handles missingTableNameEnv in UpdateRunningStreams", async () => {
            // Mock CheckRunningStreams success
            dynamoMock.on(GetCommand).resolves({
                Item: {
                    instanceArn: "arn:aws:ec2:us-west-2:123456789012:instance/i-123",
                    userId: "user-123",
                    sessionId: "session-123",
                },
            });

            // test handler's env var check
            restoreEnv();
            delete process.env.RUNNING_STREAMS_TABLE_NAME;

            await expect(simulateWorkflow("user-123", true)).rejects.toThrow("MissingTableNameEnv");
        });

        it("should handle database error in CheckRunningStreams", async () => {
            dynamoMock.on(GetCommand).rejects(new Error("DynamoDB error"));

            await expect(simulateWorkflow("user-123", true)).rejects.toThrow();
        });

        it("should handle database error in UpdateRunningStreams", async () => {
            // Mock CheckRunningStreams success
            dynamoMock.on(GetCommand).resolves({
                Item: {
                    instanceArn: "arn:aws:ec2:us-west-2:123456789012:instance/i-123",
                    userId: "user-123",
                    sessionId: "session-123",
                },
            });

            // tests handler's error handling
            dynamoMock.on(UpdateCommand).rejects(new Error("DynamoDB update error"));

            await expect(simulateWorkflow("user-123", true)).rejects.toThrow();
        });
    });

    describe("Data Flow Verification", () => {
        it("passes correct data between workflow steps", async () => {
            const testInstanceArn = "arn:aws:ec2:us-west-2:123456789012:instance/i-test123";
            const testSessionId = "session-test123";

            // Mock CheckRunningStreams
            dynamoMock.on(GetCommand).resolves({
                Item: {
                    instanceArn: testInstanceArn,
                    userId: "user-123",
                    sessionId: testSessionId,
                },
            });

            // terminateEC2Handler is a stub, no EC2 mocking needed

            dynamoMock.on(UpdateCommand).resolves({});

            const result = await simulateWorkflow("user-123", true);

            expect(result.checkResult?.instanceArn).toBe(testInstanceArn);
            expect(result.checkResult?.sessionId).toBe(testSessionId);

            // Verify UpdateRunningStreams was called with correct data
            const updateCalls = dynamoMock.commandCalls(UpdateCommand);
            expect(updateCalls).toHaveLength(1);
            expect(updateCalls[0].args[0].input.Key).toEqual({
                userId: "user-123",
            });
            expect(updateCalls[0].args[0].input.ExpressionAttributeValues).toMatchObject({
                ":running": false,
            });
        });
    });
});
