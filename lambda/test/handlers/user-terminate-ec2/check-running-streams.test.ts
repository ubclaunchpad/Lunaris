import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { handler } from "../../../src/handlers/user-terminate-ec2/check-running-streams";
import { dynamoMock, ensureStreamsTableEnv } from "../../utils/dynamoMock";

let restoreEnv: () => void;

describe("user-terminate-ec2/check-running-streams", () => {
    beforeEach(() => {
        dynamoMock.reset();
        restoreEnv = ensureStreamsTableEnv();
    });

    afterEach(() => {
        restoreEnv();
    });

    it("returns valid=true when a session exists", async () => {
        dynamoMock.on(GetCommand).resolves({
            Item: {
                userId: "user-123",
                sessionId: "session-456",
                instanceArn: "arn:aws:ec2:region:acct:instance/i-abc",
            },
        });

        const result = await handler({ userId: "user-123" });

        expect(result).toEqual({
            valid: true,
            sessionId: "session-456",
            instanceArn: "arn:aws:ec2:region:acct:instance/i-abc",
        });
    });

    it("falls back to the userId when sessionId is absent", async () => {
        dynamoMock.on(GetCommand).resolves({
            Item: {
                userId: "user-456",
                instanceArn: "arn:aws:ec2:region:acct:instance/i-def",
            },
        });

        const result = await handler({ userId: "user-456" });

        expect(result).toEqual({
            valid: true,
            sessionId: "user-456",
            instanceArn: "arn:aws:ec2:region:acct:instance/i-def",
        });
    });

    it("returns valid=false when no session is found", async () => {
        dynamoMock.on(GetCommand).resolves({ Item: undefined });

        const result = await handler({ userId: "user-123" });

        expect(result).toEqual({
            valid: false,
            message: "No active streaming session found for user",
        });
    });

    it("throws when RUNNING_STREAMS_TABLE_NAME is missing", async () => {
        restoreEnv();
        delete process.env.RUNNING_STREAMS_TABLE_NAME;

        await expect(handler({ userId: "user-123" })).rejects.toThrow("MissingTableNameEnv");
    });

    it("propagates DynamoDB errors", async () => {
        dynamoMock.on(GetCommand).rejects(new Error("ddb-error"));

        await expect(handler({ userId: "user-123" })).rejects.toThrow("ddb-error");
    });
});
