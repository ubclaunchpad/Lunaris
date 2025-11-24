import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    UpdateCommand,
    QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import DynamoDBWrapper from "../../src/utils/dynamoDbWrapper";

type SendFn = (command: GetCommand | PutCommand | UpdateCommand | QueryCommand) => Promise<any>;
const sendMock: jest.MockedFunction<SendFn> = jest.fn();
let fromSpy: jest.SpiedFunction<typeof DynamoDBDocumentClient.from>;

describe("DynamoDBWrapper", () => {
    beforeEach(() => {
        sendMock.mockReset();
        fromSpy = jest
            .spyOn(DynamoDBDocumentClient, "from")
            .mockReturnValue({ send: sendMock } as any);
    });

    afterEach(() => {
        fromSpy.mockRestore();
    });

    describe("getItem", () => {
        it("returns the fetched item and forwards options", async () => {
            sendMock.mockResolvedValue({ Item: { userId: "user-123" } });
            const wrapper = new DynamoDBWrapper("test-table");

            const item = await wrapper.getItem({ userId: "user-123" }, { ConsistentRead: true });

            expect(item).toEqual({ userId: "user-123" });

            const command = sendMock.mock.calls[0][0] as GetCommand;
            expect(command).toBeInstanceOf(GetCommand);
            expect(command.input).toMatchObject({
                TableName: "test-table",
                Key: { userId: "user-123" },
                ConsistentRead: true,
            });
        });

        it("returns null when DynamoDB has no item", async () => {
            sendMock.mockResolvedValue({});
            const wrapper = new DynamoDBWrapper("test-table");

            const item = await wrapper.getItem({ userId: "missing" });

            expect(item).toBeNull();
            const command = sendMock.mock.calls[0][0] as GetCommand;
            expect(command.input.TableName).toBe("test-table");
        });
    });

    describe("putItem", () => {
        it("writes items with the provided options", async () => {
            sendMock.mockResolvedValue({});
            const wrapper = new DynamoDBWrapper("test-table");

            await wrapper.putItem(
                { userId: "user-123" },
                { ConditionExpression: "attribute_not_exists(userId)" },
            );

            const command = sendMock.mock.calls[0][0] as PutCommand;
            expect(command).toBeInstanceOf(PutCommand);
            expect(command.input).toMatchObject({
                TableName: "test-table",
                Item: { userId: "user-123" },
                ConditionExpression: "attribute_not_exists(userId)",
            });
        });

        it("writes items without options", async () => {
            sendMock.mockResolvedValue({});
            const wrapper = new DynamoDBWrapper("test-table");

            await wrapper.putItem({ userId: "user-456", status: "active" });

            const command = sendMock.mock.calls[0][0] as PutCommand;
            expect(command.input).toMatchObject({
                TableName: "test-table",
                Item: { userId: "user-456", status: "active" },
            });
        });
    });

    describe("updateItem", () => {
        it("updates items with the provided key and expressions", async () => {
            sendMock.mockResolvedValue({});
            const wrapper = new DynamoDBWrapper("test-table");

            await wrapper.updateItem(
                { userId: "user-123" },
                {
                    UpdateExpression: "set lastSeen = :ts",
                    ExpressionAttributeValues: { ":ts": 123 },
                },
            );

            const command = sendMock.mock.calls[0][0] as UpdateCommand;
            expect(command).toBeInstanceOf(UpdateCommand);
            expect(command.input).toMatchObject({
                TableName: "test-table",
                Key: { userId: "user-123" },
                UpdateExpression: "set lastSeen = :ts",
                ExpressionAttributeValues: { ":ts": 123 },
            });
        });
    });

    describe("queryItemsByUserId", () => {
        it("queries items by userId and returns results", async () => {
            const mockItems = [
                { userId: "user-123", instanceId: "i-abc", status: "running" },
                { userId: "user-123", instanceId: "i-def", status: "stopped" },
            ];
            sendMock.mockResolvedValue({ Items: mockItems });
            const wrapper = new DynamoDBWrapper("test-table");

            const items = await wrapper.queryItemsByUserId("user-123");

            expect(items).toEqual(mockItems);
            const command = sendMock.mock.calls[0][0] as QueryCommand;
            expect(command).toBeInstanceOf(QueryCommand);
            expect(command.input).toMatchObject({
                TableName: "test-table",
                IndexName: "UserIdIndex",
                KeyConditionExpression: "userId = :userId",
                ExpressionAttributeValues: { ":userId": "user-123" },
            });
        });

        it("returns empty array when no items found", async () => {
            sendMock.mockResolvedValue({ Items: undefined });
            const wrapper = new DynamoDBWrapper("test-table");

            const items = await wrapper.queryItemsByUserId("user-456");

            expect(items).toEqual([]);
        });

        it("throws error when query fails", async () => {
            sendMock.mockRejectedValue(new Error("DynamoDB error"));
            const wrapper = new DynamoDBWrapper("test-table");

            await expect(wrapper.queryItemsByUserId("user-123")).rejects.toThrow(
                "Failed to query items by userId: DynamoDB error",
            );
        });
    });

    describe("getTableName", () => {
        it("returns the table name", () => {
            const wrapper = new DynamoDBWrapper("my-custom-table");

            expect(wrapper.getTableName()).toBe("my-custom-table");
        });
    });
});
