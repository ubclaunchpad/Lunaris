import { describe, expect, it } from "@jest/globals";
import { handler } from "../../src/handlers/terminateInstance";

describe("terminateInstance handler", () => {
    it("returns 400 when userId is missing", async () => {
        const response = await handler({ body: JSON.stringify({}) } as any);

        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.body)).toEqual({
            message: "User id parameter is required",
        });
    });

    it("returns 400 when the body is undefined", async () => {
        const response = await handler({} as any);

        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.body)).toEqual({
            message: "User id parameter is required",
        });
    });

    it("returns 200 when userId is provided", async () => {
        const response = await handler({ body: JSON.stringify({ userId: "user-123" }) } as any);

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body)).toEqual({
            message: "This is the Terminate Instance handler",
        });
    });
});
