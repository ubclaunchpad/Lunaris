import DynamoDBWrapper from "../../utils/dynamoDbWrapper";

export const handler = async (
    event: UpdateRunningStreamsEvent,
): Promise<UpdateRunningStreamsResult> => {
    if (!process.env.RUNNING_STREAMS_TABLE_NAME) {
        throw new Error("MissingTableNameEnv");
    }

    const db = new DynamoDBWrapper(process.env.RUNNING_STREAMS_TABLE_NAME);

    // Delete the running stream record (instanceArn is the primary key)
    await db.deleteItem({ instanceArn: event.instanceArn });

    return { success: true };
};

type UpdateRunningStreamsEvent = {
    userId: string;
    instanceArn: string;
};

type UpdateRunningStreamsResult = {
    success: boolean;
};
