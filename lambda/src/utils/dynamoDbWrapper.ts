import { DynamoDBClient, DynamoDBClientConfig } from "@aws-sdk/client-dynamodb";
import {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    UpdateCommand,
    DeleteCommand,
    QueryCommand,
    type TranslateConfig,
    type GetCommandInput,
    type PutCommandInput,
    type GetCommandOutput,
    type UpdateCommandInput,
    type DeleteCommandInput,
    type QueryCommandInput,
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

        try {
            await this.client.send(new UpdateCommand(inputConfig));
        } catch (error) {
            console.error("DynamoDB Update Error Details:");
            console.error("Table Name:", this.tableName);
            console.error("Key:", JSON.stringify(key));
            console.error("Update Expression:", inputConfig.UpdateExpression);
            console.error("Full Config:", JSON.stringify(inputConfig));
            console.error("Full Error:", error);
            throw error;
        }
    }

    async deleteItem(key: DeleteCommandInput["Key"], options?: Partial<DeleteCommandInput>) {
        const inputConfig: DeleteCommandInput = {
            ...(options ?? {}),
            TableName: this.tableName,
            Key: key,
        };

        await this.client.send(new DeleteCommand(inputConfig));
    }

    async query(options: Partial<QueryCommandInput>) {
        const inputConfig: QueryCommandInput = {
            ...options,
            TableName: this.tableName,
        };

        const response = await this.client.send(new QueryCommand(inputConfig));
        return response.Items ?? [];
    }

    async queryByUserId(userId: string) {
        return this.query({
            IndexName: "UserIdIndex",
            KeyConditionExpression: "userId = :userId",
            ExpressionAttributeValues: {
                ":userId": userId,
            },
        });
    }

    async queryByStatus(status: string) {
        return this.query({
            IndexName: "StatusCreationTimeIndex",
            KeyConditionExpression: "#status = :status",
            ExpressionAttributeNames: {
                "#status": "status",
            },
            ExpressionAttributeValues: {
                ":status": status,
            },
        });
    }

    async queryByRegion(region: string) {
        return this.query({
            IndexName: "RegionIndex",
            KeyConditionExpression: "#region = :region",
            ExpressionAttributeNames: {
                "#region": "region",
            },
            ExpressionAttributeValues: {
                ":region": region,
            },
        });
    }

    getTableName(): string {
        return this.tableName;
    }
}

export default DynamoDBWrapper;
