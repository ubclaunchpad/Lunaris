import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import DynamoDBWrapper from "../../src/utils/dynamoDbWrapper";

type SendFn = (command: GetCommand | PutCommand | UpdateCommand) => Promise<any>;
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
