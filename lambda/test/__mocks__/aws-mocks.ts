import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { EC2Client } from "@aws-sdk/client-ec2";
import { SSMClient } from "@aws-sdk/client-ssm";
import { SFNClient } from "@aws-sdk/client-sfn";
import { IAMClient } from "@aws-sdk/client-iam";

// Create mock clients for AWS services
export const dynamoDBMock = mockClient(DynamoDBClient);
export const dynamoDBDocumentMock = mockClient(DynamoDBDocumentClient);
export const ec2Mock = mockClient(EC2Client);
export const ssmMock = mockClient(SSMClient);
export const sfnMock = mockClient(SFNClient);
export const iamMock = mockClient(IAMClient);

// Helper function to reset all mocks
export const resetAllMocks = () => {
    dynamoDBDocumentMock.reset();
    dynamoDBMock.reset();
    ec2Mock.reset();
    ssmMock.reset();
    sfnMock.reset();
    iamMock.reset();
};

// Common mock responses
export const mockResponses = {
    dynamodb: {
        putItem: { $metadata: { httpStatusCode: 200 } },
        getItem: {
            Item: {
                id: { S: "test-id" },
                status: { S: "active" },
            },
        },
        updateItem: { $metadata: { httpStatusCode: 200 } },
        deleteItem: { $metadata: { httpStatusCode: 200 } },
    },
    dynamoDocument: {
        query: {
            Items: [],
            $metadata: { httpStatusCode: 200 },
        },
        put: {
            $metadata: { httpStatusCode: 200 },
        },
        get: {
            Item: {
                id: "test-id",
                status: "active",
            },
            $metadata: { httpStatusCode: 200 },
        },
    },
    ec2: {
        runInstances: {
            Instances: [
                {
                    InstanceId: "i-1234567890abcdef0",
                    State: { Name: "pending" },
                },
            ],
        },
        terminateInstances: {
            TerminatingInstances: [
                {
                    InstanceId: "i-1234567890abcdef0",
                    CurrentState: { Name: "shutting-down" },
                },
            ],
        },
    },
    ssm: {
        getParameter: {
            Parameter: {
                Name: "/test/parameter",
                Value: "test-value",
            },
        },
    },
    sfn: {
        startExecution: {
            executionArn:
                "arn:aws:states:us-east-1:123456789012:execution:test-state-machine:test-execution",
            startDate: new Date(),
        },
        describeExecution: {
            running: {
                status: "RUNNING",
                executionArn:
                    "arn:aws:states:us-east-1:123456789012:execution:test-state-machine:test-execution",
                stateMachineArn:
                    "arn:aws:states:us-east-1:123456789012:stateMachine:test-state-machine",
                startDate: new Date(),
            },
            succeeded: {
                status: "SUCCEEDED",
                executionArn:
                    "arn:aws:states:us-east-1:123456789012:execution:test-state-machine:test-execution",
                stateMachineArn:
                    "arn:aws:states:us-east-1:123456789012:stateMachine:test-state-machine",
                startDate: new Date(),
                stopDate: new Date(),
                output: JSON.stringify({
                    instanceId: "i-1234567890abcdef0",
                    dcvUrl: "https://54.123.45.67:8443",
                }),
            },
            failed: {
                status: "FAILED",
                executionArn:
                    "arn:aws:states:us-east-1:123456789012:execution:test-state-machine:test-execution",
                stateMachineArn:
                    "arn:aws:states:us-east-1:123456789012:stateMachine:test-state-machine",
                startDate: new Date(),
                stopDate: new Date(),
                error: "InstanceLimitExceeded",
                cause: "Cannot create instance - account limit reached",
            },
        },
    },
};
