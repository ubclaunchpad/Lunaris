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
        streamingLink: "streaming-link-placeholder", // TODO: should generate a real streaming link
    };

    const updateConfig = {
        UpdateExpression: `
      SET
        instanceArn = :instanceArn, 
        streamingLink = :streamingLink,
        updatedAt = :updatedAt,
        createdAt = if_not_exists(createdAt, :createdAt)
    `,
        ExpressionAttributeValues: {
            ":instanceArn": payload.instanceArn,
            ":streamingLink": payload.streamingLink,
            ":updatedAt": payload.updatedAt,
            ":createdAt": new Date().toISOString(),
        },
    };

    await db.updateItem({ userId: event.userId }, updateConfig);

    return { success: true };
};

type UpdateRunningStreamsEvent = {
    userId: string;
    instanceArn: string;
    running: boolean;
};

type UpdateRunningStreamsResult = {
    success: boolean;
};
