import { APIGatewayProxyHandler, APIGatewayProxyResult } from "aws-lambda";
import DynamoDBWrapper from "../utils/dynamoDbWrapper";

interface StreamRecord {
    instanceArn: string;
    userId: string;
    streamingId: string;
    streamingLink: string;
    createdAt: string;
    updatedAt: string;
}

interface ErrorResponseBody {
    error: string;
    message: string;
}

interface SuccessResponseBody {
    data: StreamRecord;
}

type ResponseBody = ErrorResponseBody | SuccessResponseBody;

// Helper function to format responses consistently
const createResponse = (statusCode: number, body: ResponseBody): APIGatewayProxyResult => ({
    statusCode,
    headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(body),
});

const runningStreamsTable = new DynamoDBWrapper(
    process.env.RUNNING_STREAMS_TABLE_NAME || "RunningStreams",
);

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        // Extract and validate userId
        const userId = event.queryStringParameters?.userId;

        if (!userId) {
            return createResponse(400, {
                error: "Bad Request",
                message: "userId query parameter is required",
            });
        }

        console.log(`Querying RunningStreams table for userId: ${userId}`);

        // Query the RunningStreams table by userId using the UserIdIndex
        const results = await runningStreamsTable.queryByUserId(userId);

        if (!results || results.length === 0) {
            return createResponse(404, {
                error: "Not Found",
                message: `No streaming session found for userId: ${userId}`,
            });
        }

        // Return the most recent entry (first result since sorted by createdAt)
        const streamRecord = results[0] as StreamRecord;

        console.log(`Found streaming session for userId ${userId}:`, streamRecord);

        return createResponse(200, {
            data: streamRecord,
        });
    } catch (error: unknown) {
        if (error instanceof Error) {
            console.error("Error occurred:", error.message);
            console.error("Stack trace:", error.stack);
        }

        return createResponse(500, {
            error: "Internal Server Error",
            message: "An unexpected error occurred while fetching streaming link",
        });
    }
};
