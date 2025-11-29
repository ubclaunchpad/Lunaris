import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { handler } from "../../../src/handlers/user-terminate-ec2/update-running-streams";
import { dynamoMock, ensureStreamsTableEnv } from "../../utils/dynamoMock";

let restoreEnv: () => void;

describe("user-terminate-ec2/update-running-streams", () => {
    beforeEach(() => {
        dynamoMock.reset();
        restoreEnv = ensureStreamsTableEnv();
    });

    afterEach(() => {
        restoreEnv();
    });

    it("marks the streaming session as not running", async () => {
        dynamoMock.on(UpdateCommand).resolves({});

        const result = await handler({
            userId: "user-123",
            sessionId: "session-456",
            instanceArn: "arn:aws:ec2:region:acct:instance/i-abc",
        });

        expect(result).toEqual({ success: true });

        const calls = dynamoMock.commandCalls(UpdateCommand);
        expect(calls).toHaveLength(1);
        const input = calls[0].args[0].input;

        expect(input.ExpressionAttributeValues).toMatchObject({
            ":running": false,
        });
        expect(typeof input.ExpressionAttributeValues?.[":updatedAt"]).toBe("string");
    });

    it("throws when RUNNING_STREAMS_TABLE_NAME is missing", async () => {
        restoreEnv();
        delete process.env.RUNNING_STREAMS_TABLE_NAME;

        await expect(
            handler({
                userId: "user-123",
                sessionId: "session-456",
                instanceArn: "arn",
            }),
        ).rejects.toThrow("MissingTableNameEnv");
    });

    it("propagates DynamoDB failures", async () => {
        dynamoMock.on(UpdateCommand).rejects(new Error("ddb-update"));

        await expect(
            handler({
                userId: "user-123",
                sessionId: "session-456",
                instanceArn: "arn",
            }),
        ).rejects.toThrow("ddb-update");
    });
});
