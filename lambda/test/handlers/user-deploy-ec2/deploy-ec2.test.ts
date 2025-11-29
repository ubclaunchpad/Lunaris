import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { handler } from "../../../src/handlers/user-deploy-ec2/deploy-ec2";

describe("user-deploy-ec2/deploy-ec2", () => {
    let logSpy: jest.SpiedFunction<typeof console.log>;

    beforeEach(() => {
        logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        logSpy.mockRestore();
    });

    it("returns success=true for the stub implementation", async () => {
        const result = await handler({ userId: "user-123" });

        expect(result).toEqual({ success: true });
    });

    it("logs the placeholder message", async () => {
        await handler({ userId: "user-123" });

        expect(logSpy).toHaveBeenCalledWith("Stub - Deploying EC2 instance for user");
    });
});
