import DynamoDBWrapper from "../../utils/dynamoDbWrapper";

export const handler = async (
    event: UpdateRunningStreamsEvent,
): Promise<UpdateRunningStreamsResult> => {
    if (!process.env.RUNNING_STREAMS_TABLE_NAME) {
        throw new Error("MissingTableNameEnv");
    }

    const db = new DynamoDBWrapper(process.env.RUNNING_STREAMS_TABLE_NAME);
    const { instanceArn } = event;

    if (!instanceArn) {
        throw new Error("Instance ARN is required");
    }

    try {
        console.log(`Deleting stream record for instance: ${instanceArn}`);

        await db.deleteItem({ instanceArn });

        console.log(`Successfully deleted stream record for ${instanceArn}`);
        return { success: true };
    } catch (error) {
        throw new Error(
            `DatabaseError: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
    }
};

type UpdateRunningStreamsEvent = {
    userId: string;
    instanceArn: string;
    previousState: string;
    currentState: string;
};

type UpdateRunningStreamsResult = {
    success: boolean;
};
