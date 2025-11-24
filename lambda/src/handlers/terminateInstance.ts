import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const body = JSON.parse(event.body || "{}");
    const userId = body.userId;
    if (!userId) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: "User id parameter is required" }),
        };
    }
    console.log("Terminate Instance Handler Success!");
    return {
        statusCode: 200,
        body: JSON.stringify({ message: "This is the Terminate Instance handler" }),
    };
};
