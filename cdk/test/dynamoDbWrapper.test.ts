import DynamoDBWrapper from "../lib/utils/dynamoDbWrapper";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";

describe("DynamoDBWrapper", () => {
  const tableName = "TestTable";
  const mockDynamoClient = mockClient(DynamoDBDocumentClient);

  beforeEach(() => {
    mockDynamoClient.reset();
  });

  it("getItem returns the item as expected", async () => {
    const userId = "1";
    const item = {
      instanceArn: "test-instance-arn",
      userId,
      streamingId: "123",
      streamingLink: "https://example.com",
    };

    mockDynamoClient
      .on(GetCommand, { TableName: tableName, Key: { userId } })
      .resolves({ Item: item });

    const dynamoWrapper = new DynamoDBWrapper(tableName);
    const result = await dynamoWrapper.getItem({ userId });

    expect(result).toStrictEqual(item);
  });

  it("getItem returns null when using non-existing key", async () => {
    const invalidUserId = "0";
    const validUserId = "1";

    const item = {
      instanceArn: "test-instance-arn",
      userId: validUserId,
      streamingId: "123",
      streamingLink: "https://example.com",
    };

    mockDynamoClient
      .on(GetCommand, {
        TableName: tableName,
        Key: { userId: validUserId },
      })
      .resolves({ Item: item });

    const dynamoWrapper = new DynamoDBWrapper(tableName);
    const result = await dynamoWrapper.getItem({ userId: invalidUserId });

    expect(result).toBeNull();
  });

  it("putItem calls the PutCommand with correct parameters", async () => {
    mockDynamoClient.on(PutCommand).resolves({});

    const dynamoWrapper = new DynamoDBWrapper(tableName);
    const item = {
      instanceArn: "test-instance-arn",
      userId: "1",
      streamingId: "123",
      streamingLink: "https://example.com",
    };
    await dynamoWrapper.putItem(item);

    const calls = mockDynamoClient.commandCalls(PutCommand);
    expect(calls.length).toBe(1);
    expect(calls[0].args[0].input).toEqual({
      TableName: tableName,
      Item: item,
    });
  });
});
