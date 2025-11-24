import DynamoDBWrapper from "../../utils/dynamoDbWrapper";

export const handler = async (
    event: CheckRunningStreamsEvent,
): Promise<CheckRunningStreamsResult> => {
    if (!process.env.RUNNING_STREAMS_TABLE_NAME) {
        throw new Error("MissingTableNameEnv");
    }

    const db = new DynamoDBWrapper(process.env.RUNNING_STREAMS_TABLE_NAME);
    const userId = event.userId;

    const item = await db.getItem({ userId });
    return item ? { streamsRunning: true } : { streamsRunning: false };
};

type CheckRunningStreamsEvent = {
    userId: string;
};

type CheckRunningStreamsResult = {
    streamsRunning: boolean;
};
