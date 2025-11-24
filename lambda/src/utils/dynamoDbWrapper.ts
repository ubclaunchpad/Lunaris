import { DynamoDBClient, DynamoDBClientConfig } from "@aws-sdk/client-dynamodb";
import {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    UpdateCommand,
    QueryCommand,
    type TranslateConfig,
    type GetCommandInput,
    type PutCommandInput,
    type GetCommandOutput,
    type UpdateCommandInput,
} from "@aws-sdk/lib-dynamodb";

class DynamoDBWrapper {
    private client: DynamoDBDocumentClient;
    private tableName: string;

    constructor(
        tableName: string,
        translateConfig?: TranslateConfig,
        clientConfig?: DynamoDBClientConfig,
    ) {
        const config: DynamoDBClientConfig = clientConfig ?? {};

        if (process.env.DYNAMODB_ENDPOINT) {
            config.endpoint = process.env.DYNAMODB_ENDPOINT;
        }

        this.client = DynamoDBDocumentClient.from(new DynamoDBClient(config), translateConfig);
        this.tableName = tableName;
    }

    async queryItemsByUserId(userId: string) {
        try {
            const command = new QueryCommand({
                TableName: this.tableName,
                IndexName: "UserIdIndex",
                KeyConditionExpression: "userId = :userId",
                ExpressionAttributeValues: {
                    ":userId": userId,
                },
            });

            const res = await this.client.send(command);
            return res.Items || [];
        } catch (error) {
            console.error("Error querying items by userId:", error);
            throw new Error(
                `Failed to query items by userId: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
        }
    }

    async getItem(
        key: GetCommandInput["Key"],
        options?: Partial<GetCommandInput>,
    ): Promise<GetCommandOutput["Item"] | null> {
        const inputConfig: GetCommandInput = {
            ...(options ?? {}),
            TableName: this.tableName,
            Key: key,
        };

        const response = await this.client.send(new GetCommand(inputConfig));
        return response?.Item ?? null;
    }

    async putItem(Item: PutCommandInput["Item"], options?: Partial<PutCommandInput>) {
        const inputConfig: PutCommandInput = {
            ...(options ?? {}),
            TableName: this.tableName,
            Item,
        };

        await this.client.send(new PutCommand(inputConfig));
    }

    async updateItem(key: UpdateCommandInput["Key"], options?: Partial<UpdateCommandInput>) {
        const inputConfig: UpdateCommandInput = {
            ...(options ?? {}),
            TableName: this.tableName,
            Key: key,
        };

        await this.client.send(new UpdateCommand(inputConfig));
    }

    getTableName(): string {
        return this.tableName;
    }
}

export default DynamoDBWrapper;
