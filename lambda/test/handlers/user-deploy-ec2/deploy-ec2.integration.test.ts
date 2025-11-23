import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
    DynamoDBDocumentClient,
    PutCommand,
    GetCommand,
    DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import DynamoDBWrapper from "../../../src/utils/dynamoDbWrapper";

const testTableName = "RunningInstances";

const getDynamoClient = () => {
    return new DynamoDBClient({
        endpoint: process.env.DYNAMODB_ENDPOINT || "http://localhost:8000",
        region: process.env.CDK_DEFAULT_REGION || "us-east-1",
        credentials: {
            accessKeyId: "dummy",
            secretAccessKey: "dummy",
        },
    });
};

describe("deploy-ec2 DynamoDB Integration Tests", () => {
    let dynamoClient: DynamoDBClient;
    let docClient: DynamoDBDocumentClient;
    let wrapper: DynamoDBWrapper;
    const testInstanceIds: string[] = [];

    beforeAll(async () => {
        process.env.AWS_ACCESS_KEY_ID = "dummy";
        process.env.AWS_SECRET_ACCESS_KEY = "dummy";
        process.env.AWS_REGION = "us-east-1";
        process.env.DYNAMODB_ENDPOINT = "http://localhost:8000";

        dynamoClient = getDynamoClient();
        docClient = DynamoDBDocumentClient.from(dynamoClient);
    });

    afterAll(async () => {
        for (const instanceId of testInstanceIds) {
            try {
                await docClient.send(
                    new DeleteCommand({
                        TableName: testTableName,
                        Key: { instanceId },
                    })
                );
            } catch (error) {
                console.error(`Error cleaning up ${instanceId}:`, error);
            }
        }
        dynamoClient.destroy();

        delete process.env.AWS_ACCESS_KEY_ID;
        delete process.env.AWS_SECRET_ACCESS_KEY;
        delete process.env.AWS_REGION;
        delete process.env.DYNAMODB_ENDPOINT;
    });

    beforeEach(() => {
        wrapper = new DynamoDBWrapper(testTableName);
    });

    describe("RunningInstances table operations", () => {
        const generateTestId = (prefix: string) => {
            const id = `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
            testInstanceIds.push(id);
            return id;
        };

        const createMockDeployment = (instanceId: string, userId: string) => ({
            instanceId,
            userId,
            instanceArn: `arn:aws:ec2:us-east-1:123456789012:instance/${instanceId}`,
            publicIp: "54.123.45.67",
            privateIp: "10.0.1.100",
            ebsVolumeId: `vol-${Date.now()}`,
            dcvUrl: `https://54.123.45.67:8443?session-id=user-${userId}-session`,
            status: "running",
            createdAt: new Date().toISOString(),
            creationTime: new Date().toISOString(),
            instanceType: "t3.medium",
            amiId: "ami-test123",
        });

        it("should save deployment info to DynamoDB", async () => {
            const instanceId = generateTestId("i-save-test");
            const userId = "user-save-test";
            const deployment = createMockDeployment(instanceId, userId);

            await wrapper.putItem(deployment);

            const result = await docClient.send(
                new GetCommand({
                    TableName: testTableName,
                    Key: { instanceId },
                })
            );

            expect(result.Item).toBeDefined();
            expect(result.Item?.instanceId).toBe(instanceId);
            expect(result.Item?.userId).toBe(userId);
            expect(result.Item?.ebsVolumeId).toBeDefined();
            expect(result.Item?.status).toBe("running");
        });

        it("should retrieve deployment info from DynamoDB", async () => {
            const instanceId = generateTestId("i-retrieve-test");
            const userId = "user-retrieve-test";
            const deployment = createMockDeployment(instanceId, userId);

            await docClient.send(
                new PutCommand({
                    TableName: testTableName,
                    Item: deployment,
                })
            );

            const result = await wrapper.getItem({ instanceId });

            expect(result).toBeDefined();
            expect(result?.instanceId).toBe(instanceId);
            expect(result?.userId).toBe(userId);
        });

        it("should query deployments by userId using GSI", async () => {
            const userId = `user-query-test-${Date.now()}`;
            const instanceId1 = generateTestId("i-query-test-1");
            const instanceId2 = generateTestId("i-query-test-2");

            const deployment1 = createMockDeployment(instanceId1, userId);
            const deployment2 = createMockDeployment(instanceId2, userId);

            await docClient.send(
                new PutCommand({
                    TableName: testTableName,
                    Item: deployment1,
                })
            );
            await docClient.send(
                new PutCommand({
                    TableName: testTableName,
                    Item: deployment2,
                })
            );

            await new Promise((resolve) => setTimeout(resolve, 2000));

            const results = await wrapper.queryItemsByUserId(userId);

            expect(results.length).toBeGreaterThanOrEqual(2);
            expect(results.some((item) => item.instanceId === instanceId1)).toBe(true);
            expect(results.some((item) => item.instanceId === instanceId2)).toBe(true);
        }, 15000);

        it("should handle concurrent writes to the same table", async () => {
            const userId = `user-concurrent-test-${Date.now()}`;
            const deployments = Array.from({ length: 5 }, (_, i) => {
                const instanceId = generateTestId(`i-concurrent-${i}`);
                return createMockDeployment(instanceId, userId);
            });

            await Promise.all(
                deployments.map((deployment) => wrapper.putItem(deployment))
            );

            for (const deployment of deployments) {
                const result = await wrapper.getItem({ instanceId: deployment.instanceId });
                expect(result).toBeDefined();
                expect(result?.instanceId).toBe(deployment.instanceId);
            }
        });

        it("should update deployment status", async () => {
            const instanceId = generateTestId("i-update-test");
            const userId = "user-update-test";
            const deployment = createMockDeployment(instanceId, userId);

            await wrapper.putItem(deployment);

            await wrapper.updateItem(
                { instanceId },
                {
                    UpdateExpression: "set #status = :status",
                    ExpressionAttributeNames: {
                        "#status": "status",
                    },
                    ExpressionAttributeValues: {
                        ":status": "terminated",
                    },
                }
            );

            const result = await wrapper.getItem({ instanceId });

            expect(result?.status).toBe("terminated");
        });
    });
});
