import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';

// Helper function to format responses consistently
const createResponse = (statusCode: number, body: any): APIGatewayProxyResult => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  },
  body: JSON.stringify(body),
});

export const handler: APIGatewayProxyHandler = async (event, context) => {
  try {
    // Extract and validate userId
    const userId = event.queryStringParameters?.userId;

    if (!userId) {
      return createResponse(400, {
        error: "Bad Request",
        message: "userId query parameter is required",
      });
    }

    console.log(`Received userId: ${userId}`);

    // Success response - just return the data
    return createResponse(200, {
      userId,
      message: `Hello, user ${userId}!`,
    });
  } catch (error: any) {
    console.error("Error occurred:", error.message);

    return createResponse(500, {
      error: "Internal Server Error",
      message: "An unexpected error occurred",
    });
  }
};