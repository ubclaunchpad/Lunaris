import DynamoDBWrapper from "../../utils/dynamoDbWrapper";
import { Context } from "aws-lambda";

type UpdateRunningStreamsEvent = {
    userId: string;
    instanceArn: string;
    executionName?: string;
    running: boolean;
};

type UpdateRunningStreamsResult = {
    success: boolean;
};

export const handler = async (
    event: UpdateRunningStreamsEvent,
    context: Context,
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

    const stateMachineName = "UserDeployEC2Workflow";
    const region = process.env.AWS_REGION || "us-east-1";
    const accountId = process.env.AWS_ACCOUNT_ID || context.invokedFunctionArn.split(":")[4];

    const executionArn = event.executionName
        ? `arn:aws:states:${region}:${accountId}:execution:${stateMachineName}:${event.executionName}`
        : undefined;

    const updateConfig = {
        UpdateExpression: `
      SET
        instanceArn = :instanceArn, 
        executionArn = :executionArn,
        streamingLink = :streamingLink,
        updatedAt = :updatedAt,
        createdAt = if_not_exists(createdAt, :createdAt)
    `,
        ExpressionAttributeValues: {
            ":instanceArn": payload.instanceArn,
            ":executionArn": executionArn,
            ":streamingLink": payload.streamingLink,
            ":updatedAt": payload.updatedAt,
            ":createdAt": new Date().toISOString(),
        },
    };

    await db.updateItem({ instanceArn: event.instanceArn }, updateConfig);

    return { success: true };
};
