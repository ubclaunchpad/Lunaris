import { describe, expect, it } from "@jest/globals";
import { APIGatewayProxyResult } from "aws-lambda";
import { handler } from "../../src/handlers/streamingLink";

const noopCallback = () => undefined;

describe("streamingLink handler", () => {
    it("returns 400 when userId query param is missing", async () => {
        const response = (await handler(
            { queryStringParameters: {} } as any,
            {} as any,
            noopCallback as any,
        )) as APIGatewayProxyResult;

        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.body)).toEqual({
            error: "Bad Request",
            message: "userId query parameter is required",
        });
    });

    it("returns 200 when userId is provided", async () => {
        const response = (await handler(
            { queryStringParameters: { userId: "user-123" } } as any,
            {} as any,
            noopCallback as any,
        )) as APIGatewayProxyResult;

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body)).toEqual({
            userId: "user-123",
            message: "Hello, user user-123!",
        });
    });

    it("returns 500 when handler throws", async () => {
        const throwingParams = new Proxy(
            {},
            {
                get() {
                    throw new Error("boom");
                },
            },
        );

        const response = (await handler(
            { queryStringParameters: throwingParams as any } as any,
            {} as any,
            noopCallback as any,
        )) as APIGatewayProxyResult;

        expect(response.statusCode).toBe(500);
        expect(JSON.parse(response.body)).toEqual({
            error: "Internal Server Error",
            message: "An unexpected error occurred",
        });
    });
});
