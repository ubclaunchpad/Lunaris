import DynamoDBWrapper from "../../utils/dynamoDbWrapper";
import { Context } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
    DynamoDBDocumentClient,
    QueryCommand,
    UpdateCommand,
    DeleteCommand,
} from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

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
    instanceId: string;
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

    // Also update the RunningInstances table to replace the placeholder instanceId with the real one
    // This is crucial for terminate to work correctly
    const runningInstancesTable = process.env.RUNNING_INSTANCES_TABLE;
    if (runningInstancesTable) {
        try {
            // Find the placeholder record for this user
            const queryCommand = new QueryCommand({
                TableName: runningInstancesTable,
                IndexName: "UserIdIndex",
                KeyConditionExpression: "userId = :userId",
                FilterExpression: "begins_with(instanceId, :prefix)",
                ExpressionAttributeValues: {
                    ":userId": event.userId,
                    ":prefix": "pending-",
                },
            });
            const queryResult = await docClient.send(queryCommand);

            if (queryResult.Items && queryResult.Items.length > 0) {
                const oldRecord = queryResult.Items[0];
                const oldInstanceId = oldRecord.instanceId;

                console.log(
                    `Found placeholder record with instanceId: ${oldInstanceId}, updating to: ${event.instanceId}`,
                );

                // Delete the old placeholder record
                const deleteCommand = new DeleteCommand({
                    TableName: runningInstancesTable,
                    Key: { instanceId: oldInstanceId },
                });
                await docClient.send(deleteCommand);

                // Create new record with real instanceId
                const { PutCommand } = await import("@aws-sdk/lib-dynamodb");
                const putCommand = new PutCommand({
                    TableName: runningInstancesTable,
                    Item: {
                        instanceId: event.instanceId,
                        userId: event.userId,
                        executionArn: oldRecord.executionArn,
                        status: "running",
                        creationTime: oldRecord.creationTime || now,
                        lastModifiedTime: now,
                    },
                });
                await docClient.send(putCommand);

                console.log(
                    `Updated RunningInstances table with real instanceId: ${event.instanceId}`,
                );
            }
        } catch (error) {
            console.error("Error updating RunningInstances table:", error);
            // Don't fail the whole operation - RunningStreams was updated successfully
        }
    }

    return { success: true, instanceId: event.instanceId };
};
