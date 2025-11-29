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

    if (!item) {
        return {
            valid: false,
            message: "No active streaming session found for user",
        };
    }

    return {
        valid: true,
        sessionId: item.sessionId || userId,
        instanceArn: item.instanceArn,
    };
};

type CheckRunningStreamsEvent = {
    userId: string;
};

type CheckRunningStreamsResult = {
    valid: boolean;
    message?: string;
    sessionId?: string;
    instanceArn?: string;
};
