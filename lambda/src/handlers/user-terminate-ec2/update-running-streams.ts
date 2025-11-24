import DynamoDBWrapper from "../../utils/dynamoDbWrapper";

export const handler = async (
    event: UpdateRunningStreamsEvent,
): Promise<UpdateRunningStreamsResult> => {
    if (!process.env.RUNNING_STREAMS_TABLE_NAME) {
        throw new Error("MissingTableNameEnv");
    }

    const db = new DynamoDBWrapper(process.env.RUNNING_STREAMS_TABLE_NAME);
    const payload = {
        ...event,
        updatedAt: new Date().toISOString(),
    };

    const updateConfig = {
        UpdateExpression: `
      SET
        running = :running,
        updatedAt = :updatedAt
    `,
        ExpressionAttributeValues: {
            ":running": false,
            ":updatedAt": payload.updatedAt,
        },
    };

    await db.updateItem({ userId: event.userId }, updateConfig);

    return { success: true };
};

type UpdateRunningStreamsEvent = {
    userId: string;
    sessionId: string;
    instanceArn: string;
    running: boolean;
};

type UpdateRunningStreamsResult = {
    success: boolean;
};
