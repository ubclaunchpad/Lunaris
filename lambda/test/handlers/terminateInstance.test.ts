import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { mockClient } from "aws-sdk-client-mock";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { handler } from "../../src/handlers/terminateInstance";
import { withEnv } from "../utils/dynamoMock";

const sfnMock = mockClient(SFNClient);
const dynamoMock = mockClient(DynamoDBDocumentClient);

const baseEvent = {
    body: JSON.stringify({
        userId: "user-123",
        instanceId: "i-1234567890abcdef0",
    }),
} as any;

let restoreEnv: () => void;

describe("terminateInstance handler", () => {
    beforeEach(() => {
        restoreEnv = withEnv({
            TERMINATE_WORKFLOW_ARN:
                "arn:aws:states:us-west-2:123456789012:stateMachine:UserTerminateEC2Workflow",
            RUNNING_INSTANCES_TABLE: "running-instances-table",
        });
        sfnMock.reset();
        dynamoMock.reset();
    });

    afterEach(() => {
        restoreEnv();
    });

    const mockSuccessfulStepFunction = () => {
        sfnMock.on(StartExecutionCommand).resolves({
            executionArn:
                "arn:aws:states:us-west-2:123456789012:execution:UserTerminateEC2Workflow:abc123",
        });
        dynamoMock.on(UpdateCommand).resolves({});
    };

    describe("Input Validation", () => {
        it("returns 400 when userId is missing", async () => {
            const event = {
                body: JSON.stringify({ instanceId: "i-123" }),
            } as any;

            const response = await handler(event);
            const body = JSON.parse(response.body);

            expect(response.statusCode).toBe(400);
            expect(body).toEqual({
                status: "error",
                message: "User ID is required",
            });
        });

        it("returns 400 when instanceId is missing", async () => {
            const event = {
                body: JSON.stringify({ userId: "user-123" }),
            } as any;

            const response = await handler(event);
            const body = JSON.parse(response.body);

            expect(response.statusCode).toBe(400);
            expect(body).toEqual({
                status: "error",
                message: "Instance ID is required",
            });
        });

        it("returns 400 when body is undefined", async () => {
            const event = {} as any;

            const response = await handler(event);
            const body = JSON.parse(response.body);

            expect(response.statusCode).toBe(400);
            expect(body).toEqual({
                status: "error",
                message: "User ID is required",
            });
        });

        it("returns 400 when body is empty object", async () => {
            const event = {
                body: JSON.stringify({}),
            } as any;

            const response = await handler(event);
            const body = JSON.parse(response.body);

            expect(response.statusCode).toBe(400);
            expect(body).toEqual({
                status: "error",
                message: "User ID is required",
            });
        });
    });

    describe("Environment Variable Validation", () => {
        it("returns 500 when TERMINATE_WORKFLOW_ARN is missing", async () => {
            restoreEnv();
            delete process.env.TERMINATE_WORKFLOW_ARN;
            process.env.RUNNING_INSTANCES_TABLE = "running-instances-table";

            const response = await handler(baseEvent);
            const body = JSON.parse(response.body);

            expect(response.statusCode).toBe(500);
            expect(body).toEqual({
                status: "error",
                message: "Internal server error: Step Function configuration missing",
            });
        });

        it("returns 500 when RUNNING_INSTANCES_TABLE is missing", async () => {
            restoreEnv();
            process.env.TERMINATE_WORKFLOW_ARN =
                "arn:aws:states:us-west-2:123456789012:stateMachine:UserTerminateEC2Workflow";
            delete process.env.RUNNING_INSTANCES_TABLE;

            const response = await handler(baseEvent);
            const body = JSON.parse(response.body);

            expect(response.statusCode).toBe(500);
            expect(body).toEqual({
                status: "error",
                message: "Internal server error: Database configuration missing",
            });
        });
    });

    describe("Successful Workflow", () => {
        it("returns 200 and invokes Step Function with correct input", async () => {
            mockSuccessfulStepFunction();

            const response = await handler(baseEvent);
            const body = JSON.parse(response.body);

            expect(response.statusCode).toBe(200);
            expect(body).toEqual({
                status: "success",
                message: "Termination workflow started successfully",
            });

            // Verify Step Function was invoked with correct parameters
            const sfnCalls = sfnMock.commandCalls(StartExecutionCommand);
            expect(sfnCalls).toHaveLength(1);
            expect(sfnCalls[0].args[0].input.stateMachineArn).toBe(
                "arn:aws:states:us-west-2:123456789012:stateMachine:UserTerminateEC2Workflow",
            );
            expect(JSON.parse(sfnCalls[0].args[0].input.input!)).toEqual({
                userId: "user-123",
            });
        });

        it("stores execution ARN in DynamoDB with correct update expression", async () => {
            mockSuccessfulStepFunction();

            await handler(baseEvent);

            // Verify DynamoDB update was called
            const updateCalls = dynamoMock.commandCalls(UpdateCommand);
            expect(updateCalls).toHaveLength(1);

            const updateInput = updateCalls[0].args[0].input;
            expect(updateInput.TableName).toBe("running-instances-table");
            expect(updateInput.Key).toEqual({
                instanceId: "i-1234567890abcdef0",
            });
            expect(updateInput.UpdateExpression).toContain("executionArn");
            expect(updateInput.UpdateExpression).toContain("#status");
            expect(updateInput.ExpressionAttributeNames).toEqual({
                "#status": "status",
            });
            expect(updateInput.ExpressionAttributeValues).toMatchObject({
                ":status": "terminating",
                ":arn": "arn:aws:states:us-west-2:123456789012:execution:UserTerminateEC2Workflow:abc123",
            });
            expect(updateInput.ExpressionAttributeValues![":timestamp"]).toBeDefined();
        });

        it("does NOT return execution ARN in response (security requirement)", async () => {
            mockSuccessfulStepFunction();

            const response = await handler(baseEvent);
            const body = JSON.parse(response.body);

            expect(body.executionArn).toBeUndefined();
            expect(body).not.toHaveProperty("executionArn");
        });
    });

    describe("Step Function Error Handling", () => {
        it("returns 409 when execution already exists", async () => {
            const error = new Error("Execution already exists");
            error.name = "ExecutionAlreadyExists";
            sfnMock.on(StartExecutionCommand).rejects(error);

            const response = await handler(baseEvent);
            const body = JSON.parse(response.body);

            expect(response.statusCode).toBe(409);
            expect(body).toEqual({
                status: "error",
                message: "Termination workflow is already in progress",
            });
        });

        it("returns 500 when state machine does not exist", async () => {
            const error = new Error("State machine does not exist");
            error.name = "StateMachineDoesNotExist";
            sfnMock.on(StartExecutionCommand).rejects(error);

            const response = await handler(baseEvent);
            const body = JSON.parse(response.body);

            expect(response.statusCode).toBe(500);
            expect(body).toEqual({
                status: "error",
                message: "Internal server error: Workflow configuration error",
            });
        });

        it("returns 500 when Step Function execution fails to return ARN", async () => {
            sfnMock.on(StartExecutionCommand).resolves({
                executionArn: undefined, // Missing ARN
            });

            const response = await handler(baseEvent);
            const body = JSON.parse(response.body);

            expect(response.statusCode).toBe(500);
            expect(body).toMatchObject({
                status: "error",
                message: "Failed to start termination workflow",
            });
        });

        it("returns 500 for other Step Function errors", async () => {
            sfnMock.on(StartExecutionCommand).rejects(new Error("Step Function service error"));

            const response = await handler(baseEvent);
            const body = JSON.parse(response.body);

            expect(response.statusCode).toBe(500);
            expect(body).toMatchObject({
                status: "error",
                message: "Failed to start termination workflow",
                error: "Unknown error",
            });
        });
    });

    describe("DynamoDB Error Handling", () => {
        it("still returns 200 when DynamoDB update fails (Step Function already started)", async () => {
            sfnMock.on(StartExecutionCommand).resolves({
                executionArn:
                    "arn:aws:states:us-west-2:123456789012:execution:UserTerminateEC2Workflow:abc123",
            });
            dynamoMock.on(UpdateCommand).rejects(new Error("DynamoDB error"));

            const response = await handler(baseEvent);
            const body = JSON.parse(response.body);

            // Should still succeed because Step Function was started
            expect(response.statusCode).toBe(200);
            expect(body).toEqual({
                status: "success",
                message: "Termination workflow started successfully",
            });
        });

        it("still returns 200 when instance record does not exist in DynamoDB", async () => {
            sfnMock.on(StartExecutionCommand).resolves({
                executionArn:
                    "arn:aws:states:us-west-2:123456789012:execution:UserTerminateEC2Workflow:abc123",
            });
            // DynamoDB returns error for non-existent item
            const error = new Error("The provided key element does not match the schema");
            error.name = "ValidationException";
            dynamoMock.on(UpdateCommand).rejects(error);

            const response = await handler(baseEvent);
            const body = JSON.parse(response.body);

            // Should still succeed because Step Function was started
            expect(response.statusCode).toBe(200);
            expect(body).toEqual({
                status: "success",
                message: "Termination workflow started successfully",
            });
        });
    });

    describe("Request Body Parsing", () => {
        it("handles valid JSON body correctly", async () => {
            mockSuccessfulStepFunction();

            const event = {
                body: JSON.stringify({
                    userId: "user-456",
                    instanceId: "i-9876543210fedcba",
                }),
            } as any;

            const response = await handler(event);
            const body = JSON.parse(response.body);

            expect(response.statusCode).toBe(200);
            expect(body.status).toBe("success");

            // Verify Step Function received correct userId
            const sfnCalls = sfnMock.commandCalls(StartExecutionCommand);
            expect(JSON.parse(sfnCalls[0].args[0].input.input!)).toEqual({
                userId: "user-456",
            });
        });

        it("handles invalid JSON body gracefully", async () => {
            const event = {
                body: "{ invalid json }",
            } as any;

            const response = await handler(event);

            expect(response.statusCode).toBe(500);
            const body = JSON.parse(response.body);
            expect(body.status).toBe("error");
        });

        it("handles unknown error gracefully", async () => {
            const event = {
                body: JSON.stringify({
                    userId: "user-456",
                    instanceId: "i-9876543210fedcba",
                }),
            } as any;
            const error = "Unknown error not an instance of Error";
            dynamoMock.on(UpdateCommand).rejects(error);
            const response = await handler(event);

            expect(response.statusCode).toBe(500);
            const body = JSON.parse(response.body);
            expect(body.status).toBe("error");
        });
    });
});
