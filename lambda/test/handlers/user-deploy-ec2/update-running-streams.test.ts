import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { handler } from "../../../src/handlers/user-deploy-ec2/update-running-streams";
import { dynamoMock, ensureStreamsTableEnv } from "../../utils/dynamoMock";

let restoreEnv: () => void;

describe("user-deploy-ec2/update-running-streams", () => {
    beforeEach(() => {
        dynamoMock.reset();
        restoreEnv = ensureStreamsTableEnv();
    });

    afterEach(() => {
        restoreEnv();
    });

    it("updates DynamoDB with instance details", async () => {
        dynamoMock.on(UpdateCommand).resolves({});

        const result = await handler({
            userId: "user-123",
            instanceArn: "arn:aws:ec2:region:123:instance/i-abc",
            running: true,
        });

        expect(result).toEqual({ success: true });

        const calls = dynamoMock.commandCalls(UpdateCommand);
        expect(calls).toHaveLength(1);
        const input = calls[0].args[0].input;

        expect(input.TableName).toBe("test-running-streams");
        expect(input.Key).toEqual({ userId: "user-123" });
        expect(input.UpdateExpression).toContain("instanceArn");
        expect(input.ExpressionAttributeValues).toMatchObject({
            ":instanceArn": "arn:aws:ec2:region:123:instance/i-abc",
            ":streamingLink": "streaming-link-placeholder",
        });
        expect(typeof input.ExpressionAttributeValues?.[":updatedAt"]).toBe("string");
    });

    it("throws when RUNNING_STREAMS_TABLE_NAME is missing", async () => {
        restoreEnv();
        delete process.env.RUNNING_STREAMS_TABLE_NAME;

        await expect(
            handler({ userId: "user-123", instanceArn: "arn", running: true }),
        ).rejects.toThrow("MissingTableNameEnv");
    });

    it("propagates DynamoDB update failures", async () => {
        dynamoMock.on(UpdateCommand).rejects(new Error("ddb-update"));

        await expect(
            handler({ userId: "user-123", instanceArn: "arn", running: true }),
        ).rejects.toThrow("ddb-update");
    });
});
