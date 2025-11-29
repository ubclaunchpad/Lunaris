import { mockClient } from "aws-sdk-client-mock";
import { SFNClient, DescribeExecutionCommand } from "@aws-sdk/client-sfn";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { handler } from "../../src/handlers/deploymentStatus";
import { APIGatewayProxyEvent, Context } from "aws-lambda";

// Create mocks
const sfnMock = mockClient(SFNClient);
const dynamoDBMock = mockClient(DynamoDBDocumentClient);

// Helper to create mock API Gateway events
const createMockEvent = (userId?: string): Partial<APIGatewayProxyEvent> => ({
    queryStringParameters: userId ? { userId } : null,
    httpMethod: "GET",
    path: "/deployment-status",
    headers: {},
    body: null,
    isBase64Encoded: false,
    requestContext: {} as any,
    resource: "",
    pathParameters: null,
    stageVariables: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
});

const mockContext: Context = {} as Context;
const mockCallback = jest.fn();

const parseResponse = (result: any) => {
    expect(result).toBeDefined();
    expect(result.headers).toEqual({
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
    });
    return JSON.parse(result.body || "{}");
};

describe("deploymentStatus handler", () => {
    beforeEach(() => {
        sfnMock.reset();
        dynamoDBMock.reset();
        jest.clearAllMocks();

        process.env.RUNNING_INSTANCES_TABLE = "RunningInstances";
    });

    afterEach(() => {
        sfnMock.restore();
        dynamoDBMock.restore();
    });

    describe("Input validation", () => {
        it.each([
            { userId: undefined, description: "missing" },
            { userId: "", description: "empty string" },
        ])("should return 400 when userId is $description", async ({ userId }) => {
            const event = createMockEvent(userId as any);
            const result = await handler(event as APIGatewayProxyEvent, mockContext, mockCallback);

            expect(result?.statusCode).toBe(400);
            const body = parseResponse(result);
            expect(body.status).toBe("FAILED");
            expect(body.message).toContain("userId query parameter is required");
        });
    });

    describe("DynamoDB queries", () => {
        it.each([
            {
                description: "no instances found",
                dynamoResponse: { Items: [], Count: 0 },
                expectedMessage: "No running instance found",
            },
            {
                description: "instance has no executionArn",
                dynamoResponse: {
                    Items: [{ instanceId: "i-123456", userId: "test-user", status: "running" }],
                    Count: 1,
                },
                expectedMessage: "No active deployment found",
            },
        ])("should return 404 when $description", async ({ dynamoResponse, expectedMessage }) => {
            dynamoDBMock.on(QueryCommand).resolves(dynamoResponse);
            const result = await handler(
                createMockEvent("test-user") as APIGatewayProxyEvent,
                mockContext,
                mockCallback,
            );

            expect(result?.statusCode).toBe(404);
            const body = parseResponse(result);
            expect(body.status).toBe("NOT_FOUND");
            expect(body.message).toContain(expectedMessage);
        });
    });

    describe("Step Functions execution statuses", () => {
        const arn = "arn:aws:states:us-east-1:123456789012:execution:DeployEC2:test";
        const baseResponse = {
            executionArn: arn,
            stateMachineArn: "arn:aws:states:us-east-1:123456789012:stateMachine:DeployEC2",
            startDate: new Date(),
        };

        beforeEach(() => {
            dynamoDBMock.on(QueryCommand).resolves({
                Items: [{ instanceId: "i-123", userId: "test-user", executionArn: arn }],
                Count: 1,
            });
        });

        it.each([
            {
                status: "RUNNING" as const,
                expects: {
                    status: "RUNNING",
                    deploymentStatus: "deploying",
                    message: "Deployment in progress...",
                },
            },
            {
                status: "SUCCEEDED" as const,
                output: JSON.stringify({
                    instanceId: "i-123",
                    dcvUrl: "https://54.123.45.67:8443",
                }),
                expects: {
                    status: "SUCCEEDED",
                    deploymentStatus: "running",
                    message: "Instance is ready for streaming",
                    instanceId: "i-123",
                    dcvUrl: "https://54.123.45.67:8443",
                },
            },
            { status: "SUCCEEDED" as const, expects: { status: "SUCCEEDED", instanceId: "i-123" } },
            {
                status: "FAILED" as const,
                error: "InstanceLimitExceeded",
                cause: "account limit reached",
                expects: {
                    status: "FAILED",
                    error: "InstanceLimitExceeded",
                    messageContains: "account limit reached",
                },
            },
            { status: "TIMED_OUT" as const, expects: { status: "FAILED" } },
            { status: "ABORTED" as const, expects: { status: "FAILED" } },
        ])("should handle $status", async ({ status, output, error, cause, expects }) => {
            sfnMock.on(DescribeExecutionCommand).resolves({
                ...baseResponse,
                status,
                ...(output && { output, stopDate: new Date() }),
                ...(error && { error, cause, stopDate: new Date() }),
                ...(!output && !error && status !== "RUNNING" && { stopDate: new Date() }),
            } as any);

            const result = await handler(
                createMockEvent("test-user") as APIGatewayProxyEvent,
                mockContext,
                mockCallback,
            );
            const body = parseResponse(result);

            expect(result?.statusCode).toBe(200);
            expect(body.status).toBe(expects.status);
            if (expects.deploymentStatus)
                expect(body.deploymentStatus).toBe(expects.deploymentStatus);
            if (expects.message) expect(body.message).toBe(expects.message);
            if (expects.instanceId) expect(body.instanceId).toBe(expects.instanceId);
            if (expects.dcvUrl) expect(body.dcvUrl).toBe(expects.dcvUrl);
            if (expects.error) expect(body.error).toBe(expects.error);
            if (expects.messageContains) expect(body.message).toContain(expects.messageContains);
        });
    });

    describe("Error handling", () => {
        it.each([
            {
                description: "DynamoDB errors",
                setupMock: () =>
                    dynamoDBMock.on(QueryCommand).rejects(new Error("DynamoDB connection failed")),
                expectedMessage: "DynamoDB connection failed",
            },
            {
                description: "Step Functions API errors",
                setupMock: () => {
                    dynamoDBMock.on(QueryCommand).resolves({
                        Items: [
                            {
                                instanceId: "i-123",
                                userId: "test-user",
                                executionArn:
                                    "arn:aws:states:us-east-1:123456789012:execution:test:exec",
                            },
                        ],
                        Count: 1,
                    });
                    sfnMock
                        .on(DescribeExecutionCommand)
                        .rejects(new Error("ExecutionDoesNotExist"));
                },
                expectedMessage: "ExecutionDoesNotExist",
            },
        ])("should handle $description gracefully", async ({ setupMock, expectedMessage }) => {
            setupMock();
            const result = await handler(
                createMockEvent("test-user") as APIGatewayProxyEvent,
                mockContext,
                mockCallback,
            );

            expect(result?.statusCode).toBe(500);
            const body = parseResponse(result);
            expect(body.status).toBe("FAILED");
            expect(body.message).toContain(expectedMessage);
        });
    });

    it("should never expose executionArn in response", async () => {
        const arn = "arn:aws:states:us-east-1:123456789012:execution:test:exec";
        dynamoDBMock.on(QueryCommand).resolves({
            Items: [{ instanceId: "i-123", userId: "test-user", executionArn: arn }],
            Count: 1,
        });
        sfnMock.on(DescribeExecutionCommand).resolves({
            status: "RUNNING" as const,
            executionArn: arn,
            stateMachineArn: "arn:aws:states:us-east-1:123456789012:stateMachine:test",
            startDate: new Date(),
        });

        const result = await handler(
            createMockEvent("test-user") as APIGatewayProxyEvent,
            mockContext,
            mockCallback,
        );

        expect(parseResponse(result).executionArn).toBeUndefined();
        expect(result?.body).not.toContain("arn:aws:states");
    });
});
