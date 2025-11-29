import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { mockClient } from "aws-sdk-client-mock";
import { EC2Client, RunInstancesCommand } from "@aws-sdk/client-ec2";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { handler } from "../../src/handlers/deployInstance";
import { withEnv } from "../utils/dynamoMock";

const ec2Mock = mockClient(EC2Client);
const dynamoMock = mockClient(DynamoDBDocumentClient);

const baseEvent = {
    body: JSON.stringify({
        userId: "user-123",
        amiId: "ami-abc",
        instanceType: "t3.micro",
    }),
} as any;

const context = {
    invokedFunctionArn: "arn:aws:lambda:us-west-2:123456789012:function:test",
} as any;

let restoreEnv: () => void;

describe("deployInstance handler", () => {
    beforeEach(() => {
        restoreEnv = withEnv({ RUNNING_INSTANCES_TABLE: "running-table" });
        ec2Mock.reset();
        dynamoMock.reset();
    });

    afterEach(() => {
        restoreEnv();
    });

    const mockSuccessfulEc2 = () => {
        ec2Mock.on(RunInstancesCommand).resolves({
            Instances: [
                {
                    InstanceId: "i-123",
                    State: { Name: "pending" },
                    Placement: { AvailabilityZone: "us-west-2a" },
                    InstanceType: "g4dn.xlarge",
                    BlockDeviceMappings: [{ Ebs: { VolumeId: "vol-1" } }],
                },
            ],
        });

        dynamoMock.on(PutCommand).resolves({});
    };

    it("returns 200 when EC2 launch and Dynamo write succeed", async () => {
        mockSuccessfulEc2();

        const response = await handler(baseEvent, context);
        const body = JSON.parse(response.body);

        expect(response.statusCode).toBe(200);
        expect(body).toMatchObject({
            message: "Instance deployed successfully",
            instanceId: "i-123",
            status: "pending",
        });

        const putCalls = dynamoMock.commandCalls(PutCommand);
        expect(putCalls).toHaveLength(1);
        expect(putCalls[0].args[0].input.TableName).toBe("running-table");
    });

    it("returns 400 when userId is missing", async () => {
        const response = await handler({ body: JSON.stringify({ amiId: "ami" }) } as any, context);

        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.body)).toEqual({ message: "User ID is required" });
    });

    it("returns 400 when amiId is missing", async () => {
        const response = await handler(
            { body: JSON.stringify({ userId: "user-123" }) } as any,
            context,
        );

        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.body)).toEqual({ message: "AMI ID is required" });
    });

    it("returns 500 when EC2 does not return an instance", async () => {
        ec2Mock.on(RunInstancesCommand).resolves({ Instances: [] });

        const response = await handler(baseEvent, context);

        expect(response.statusCode).toBe(500);
        expect(JSON.parse(response.body).message).toBe("Failed to deploy instance");
    });

    it("returns 500 when DynamoDB write fails", async () => {
        mockSuccessfulEc2();
        dynamoMock.on(PutCommand).rejects(new Error("ddb-put"));

        const response = await handler(baseEvent, context);

        expect(response.statusCode).toBe(500);
        expect(JSON.parse(response.body).message).toBe("Failed to deploy instance");
    });

    it("returns 500 when RUNNING_INSTANCES_TABLE env var is missing", async () => {
        restoreEnv();
        delete process.env.RUNNING_INSTANCES_TABLE;

        const response = await handler(baseEvent, context);

        expect(response.statusCode).toBe(500);
        expect(JSON.parse(response.body)).toMatchObject({
            message: "Failed to deploy instance",
            error: "MissingRunningInstancesTable",
        });
    });

    it("falls back to default metadata when EC2 response omits optional fields", async () => {
        ec2Mock.on(RunInstancesCommand).resolves({
            Instances: [
                {
                    InstanceId: "i-min",
                    // No state, placement, block device mappings, or instance type returned
                },
            ],
        });
        dynamoMock.on(PutCommand).resolves({});

        const response = await handler(
            {
                body: JSON.stringify({
                    userId: "user-456",
                    amiId: "ami-xyz",
                    instanceType: "g4dn.xlarge",
                }),
            } as any,
            {} as any,
        );

        expect(response.statusCode).toBe(200);

        const putCalls = dynamoMock.commandCalls(PutCommand);
        const savedItem = putCalls[0].args[0].input.Item as any;
        expect(savedItem.instanceArn).toBe("");
        expect(savedItem.ebsVolumes).toEqual([]);
        expect(savedItem.status).toBe("pending");
        expect(savedItem.region).toBe("unknown");
        expect(savedItem.instanceType).toBe("g4dn.xlarge");
    });
});
