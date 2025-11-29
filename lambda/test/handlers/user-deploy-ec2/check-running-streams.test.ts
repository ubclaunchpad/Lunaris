import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { handler } from "../../../src/handlers/user-deploy-ec2/check-running-streams";
import { dynamoMock, ensureStreamsTableEnv } from "../../utils/dynamoMock";

let restoreEnv: () => void;

describe("user-deploy-ec2/check-running-streams", () => {
    beforeEach(() => {
        dynamoMock.reset();
        restoreEnv = ensureStreamsTableEnv();
    });

    afterEach(() => {
        restoreEnv();
    });

    it("returns streamsRunning=false when no active stream", async () => {
        dynamoMock.on(GetCommand).resolves({ Item: undefined });

        const result = await handler({ userId: "user-123" });

        expect(result).toEqual({ streamsRunning: false });
    });

    it("returns streamsRunning=true when an active stream exists", async () => {
        dynamoMock.on(GetCommand).resolves({ Item: { userId: "user-123" } });

        const result = await handler({ userId: "user-123" });

        expect(result).toEqual({ streamsRunning: true });
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
