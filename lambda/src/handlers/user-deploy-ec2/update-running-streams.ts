import DynamoDBWrapper from "../../utils/dynamoDbWrapper";
import { Context } from "aws-lambda";

type UpdateRunningStreamsEvent = {
    userId: string;
    instanceId: string;
    instanceArn: string;
    dcvIp: string;
    dcvPort: number;
    dcvUser: string;
    dcvPassword: string;
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

    // Validate required fields
    if (!event.instanceArn) {
        throw new Error("Missing required field: instanceArn");
    }

    console.log("Update event received:", JSON.stringify(event));

    const db = new DynamoDBWrapper(process.env.RUNNING_STREAMS_TABLE_NAME);
    const now = new Date().toISOString();

    // Use nip.io domain for valid SSL certificates
    // The EC2 instance automatically requests a Let's Encrypt cert for this domain
    const nipDomain = event.dcvIp.replace(/\./g, "-") + ".nip.io";
    const streamingLink = `https://${nipDomain}:${event.dcvPort}`;

    const payload = {
        userId: event.userId,
        instanceId: event.instanceId,
        instanceArn: event.instanceArn,
        dcvIp: event.dcvIp,
        dcvPort: event.dcvPort,
        dcvUser: event.dcvUser,
        dcvPassword: event.dcvPassword,
        streamingLink: streamingLink,
        updatedAt: now,
    };

    const expressionAttributeValues: Record<string, string | number> = {
        ":userId": payload.userId,
        ":instanceId": payload.instanceId,
        ":dcvIp": payload.dcvIp,
        ":dcvPort": payload.dcvPort,
        ":dcvUser": payload.dcvUser,
        ":dcvPassword": payload.dcvPassword,
        ":streamingLink": payload.streamingLink,
        ":updatedAt": payload.updatedAt,
        ":createdAt": now,
    };

    const updateExpression = `
      SET
        userId = :userId,
        instanceId = :instanceId,
        dcvIp = :dcvIp,
        dcvPort = :dcvPort,
        dcvUser = :dcvUser,
        dcvPassword = :dcvPassword,
        streamingLink = :streamingLink,
        updatedAt = :updatedAt,
        createdAt = if_not_exists(createdAt, :createdAt)
    `;

    const updateConfig = {
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionAttributeValues,
    };

    await db.updateItem({ instanceArn: event.instanceArn }, updateConfig);

    return { success: true };
};
