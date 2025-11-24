import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { handler } from "../../../src/handlers/user-terminate-ec2/terminate-ec2";

describe("user-terminate-ec2/terminate-ec2", () => {
    let logSpy: jest.SpiedFunction<typeof console.log>;

    beforeEach(() => {
        logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        logSpy.mockRestore();
    });

    it("returns success=true for stub implementation", async () => {
        const result = await handler({ userId: "user-123" });

        expect(result).toEqual({ success: true });
    });

    it("logs the placeholder termination message", async () => {
        await handler({ userId: "user-123" });

        expect(logSpy).toHaveBeenCalledWith("Stub - Terminating EC2 instance for user");
    });
});
