import { Table } from "aws-cdk-lib/aws-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
    PutItemCommand,
    GetItemCommand,
    UpdateItemCommand,
    DeleteItemCommand,
    QueryCommand,
    type QueryCommandInput,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

/**
 * Data model interfaces for Running Streams table
 */
export interface RunningStream {
    streamingId: string;
    instanceArn: string;
    userId: string;
    streamingLink: string;
    createdAt?: string;
    updatedAt?: string;
}

/**
 * Data model interfaces for Running EC2Instances table
 */
export interface RunningInstance {
    instanceId: string;
    instanceArn: string;
    userId: string;
    executionArn: string;
    status?: "running" | "stopped" | "terminated";
    ebsVolumes: string[];
    creationTime: string;
    region: string;
    instanceType: string;
    lastModifiedTime: string;
}

/**
 * Generic union type for DynamoDB item types
 */
type DynamoItem = RunningStream | RunningInstance;

/**
 * Abstract class for DynamoDB wrappers
 * This class provides a common interface for all DynamoDB wrappers
 * and implements common methods for all wrappers
 * @param table - The DynamoDB table to wrap
 * @returns Abstract class for DynamoDB wrappers
 *
 */
export abstract class DynamoDbWrapper<T extends DynamoItem> {
    protected client: DynamoDBClient;
    protected tableName: string;
    protected partitionKey: string;

    constructor(table: Table) {
        this.client = new DynamoDBClient({});
        this.tableName = table.tableName;
        this.partitionKey = table.schema().partitionKey.name;
    }

    // Common CRUD operations
    abstract createItem(item: T): Promise<T>;
    abstract getItem(key: string): Promise<T | null>;
    abstract updateItem(key: string, updates: Partial<T>): Promise<T>;
    abstract deleteItem(key: string): Promise<boolean>;
    abstract queryItems(params: Partial<Omit<QueryCommandInput, "TableName">>): Promise<T[]>;

    /**
     * Query items by user ID. The table should have a global secondary index on the userId field.
     * @param userId - The user ID to query by
     * @returns The items matching the user ID
     */
    async queryItemsByUserId(userId: string): Promise<T[]> {
        return this.queryItems({
            IndexName: "UserIdIndex",
            KeyConditionExpression: "#userId = :userId",
            ExpressionAttributeNames: { "#userId": "userId" },
            ExpressionAttributeValues: marshall({ ":userId": userId }),
        });
    }
}
/**
 * concrete class for Running Streams Wrapper
 * This class provides a concrete implementation for the DynamoDbWrapper abstract class
 * for the Running Streams table
 * @param table - The DynamoDB table to wrap
 * @returns Concrete class for Running Streams Wrapper
 *
 */
export class RunningStreamWrapper extends DynamoDbWrapper<RunningStream> {
    constructor(table: Table) {
        super(table);
    }

    /**
     * create a new stream item and save it to the dynamo db table
     * @param stream - The stream to create
     * @returns The created stream
     */
    async createItem(stream: RunningStream): Promise<RunningStream> {
        const command = new PutItemCommand({
            TableName: this.tableName,
            Item: marshall(stream),
        });

        try {
            await this.client.send(command);
            return stream;
        } catch (error) {
            // console.error("Error creating stream:", error);
            throw new Error(
                `Failed to create stream: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
        }
    }

    /**
     * get an item by its partition key: instanceArn
     * @param instanceArn - The partition key to get the item by
     * @returns The item matching the partition key
     */
    async getItem(instanceArn: string): Promise<RunningStream | null> {
        const command = new GetItemCommand({
            TableName: this.tableName,
            Key: marshall({ [this.partitionKey]: instanceArn }),
        });

        try {
            const result = await this.client.send(command);
            return result.Item ? (unmarshall(result.Item) as RunningStream) : null;
        } catch (error) {
            throw new Error(
                `Failed to get stream: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
        }
    }

    /**
     * update an existing stream item in the DynamoDB table
     * @param instanceArn - The partition key to update the item by
     * @param updates - The updates json object that contains the fileds to update
     * @returns The updated stream
     */
    async updateItem(instanceArn: string, updates: Partial<RunningStream>): Promise<RunningStream> {
        const updateExpression = Object.keys(updates)
            .map((key, index) => `#${key} = :val${index}`)
            .join(", ");

        const expressionAttributeNames = Object.keys(updates).reduce(
            (acc, key) => ({ ...acc, [`#${key}`]: key }),
            {},
        );

        const expressionAttributeValues = Object.values(updates).reduce(
            (acc, value, index) => ({ ...acc, [`:val${index}`]: value }),
            {},
        );

        const command = new UpdateItemCommand({
            TableName: this.tableName,
            Key: marshall({ [this.partitionKey]: instanceArn }),
            UpdateExpression: `SET ${updateExpression}`,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: marshall(expressionAttributeValues),
            ReturnValues: "ALL_NEW",
        });

        try {
            const result = await this.client.send(command);
            return unmarshall(result.Attributes!) as RunningStream;
        } catch (error) {
            throw new Error(
                `Failed to update stream: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
        }
    }

    /**
     * delete an existing stream item from the DynamoDB table
     * @param instanceArn - The partition key to delete the item by
     * @returns True if the item was deleted, false otherwise
     *
     */
    async deleteItem(instanceArn: string): Promise<boolean> {
        const command = new DeleteItemCommand({
            TableName: this.tableName,
            Key: marshall({ [this.partitionKey]: instanceArn }),
        });

        try {
            await this.client.send(command);
            return true;
        } catch (error) {
            throw new Error(
                `Failed to delete stream: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
        }
    }

    /**
     * query items from the DynamoDB table
     * @param params - json object that contains the query parameters
     * @returns The items matching the query parameters
     */
    async queryItems(
        params: Partial<Omit<QueryCommandInput, "TableName">>,
    ): Promise<RunningStream[]> {
        const command = new QueryCommand({
            TableName: this.tableName,
            ...params,
        });

        try {
            const result = await this.client.send(command);
            return result.Items?.map((item) => unmarshall(item) as RunningStream) || [];
        } catch (error) {
            throw new Error(
                `Failed to query streams: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
        }
    }
}

// Running Instances Wrapper

/**
 * concrete class for Running Instances Wrapper
 * This class provides a concrete implementation for the DynamoDbWrapper abstract class
 * for the Running Instances table
 * @param table - The DynamoDB table to wrap
 * @returns Concrete class for Running Instances Wrapper
 *
 */
export class RunningInstanceWrapper extends DynamoDbWrapper<RunningInstance> {
    constructor(table: Table) {
        super(table);
    }

    /**
     * create a new running EC2 instance item and save it to the dynamo db table
     * @param instance - The running EC2 instance to create
     * @returns The created instance
     */
    async createItem(instance: RunningInstance): Promise<RunningInstance> {
        const command = new PutItemCommand({
            TableName: this.tableName,
            Item: marshall(instance),
        });

        try {
            await this.client.send(command);
            return instance;
        } catch (error) {
            throw new Error(
                `Failed to create instance: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
        }
    }

    /**
     * get an item by its partition key: instanceId
     * @param instanceId - The partition key to get the item by
     * @returns The item matching the partition key
     */
    async getItem(instanceId: string): Promise<RunningInstance | null> {
        const command = new GetItemCommand({
            TableName: this.tableName,
            Key: marshall({ [this.partitionKey]: instanceId }),
        });

        try {
            const result = await this.client.send(command);
            return result.Item ? (unmarshall(result.Item) as RunningInstance) : null;
        } catch (error) {
            console.error("Error getting instance:", error);
            throw new Error(
                `Failed to get instance: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
        }
    }

    /**
     * update an existing running EC2 instance item in the DynamoDB table
     * @param instanceId - The partition key to update the item by
     * @param updates - json object that contains the fileds to update
     * @returns The updated instance
     */
    async updateItem(
        instanceId: string,
        updates: Partial<RunningInstance>,
    ): Promise<RunningInstance> {
        const updateExpression = Object.keys(updates)
            .map((key, index) => `#${key} = :val${index}`)
            .join(", ");

        const expressionAttributeNames = Object.keys(updates).reduce(
            (acc, key) => ({ ...acc, [`#${key}`]: key }),
            {},
        );

        const expressionAttributeValues = Object.values(updates).reduce(
            (acc, value, index) => ({ ...acc, [`:val${index}`]: value }),
            {},
        );

        const command = new UpdateItemCommand({
            TableName: this.tableName,
            Key: marshall({ [this.partitionKey]: instanceId }),
            UpdateExpression: `SET ${updateExpression}`,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: marshall(expressionAttributeValues),
            ReturnValues: "ALL_NEW",
        });

        try {
            const result = await this.client.send(command);
            return unmarshall(result.Attributes!) as RunningInstance;
        } catch (error) {
            throw new Error(
                `Failed to update instance: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
        }
    }

    /**
     * delete an existing running EC2 instance item from the DynamoDB table
     * @param instanceId - The partition key to delete the item by
     * @returns True if the item was deleted, false otherwise
     *
     */
    async deleteItem(instanceId: string): Promise<boolean> {
        const command = new DeleteItemCommand({
            TableName: this.tableName,
            Key: marshall({ [this.partitionKey]: instanceId }),
        });

        try {
            await this.client.send(command);
            return true;
        } catch (error) {
            throw new Error(
                `Failed to delete instance: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
        }
    }

    /**
     * query items from the DynamoDB table by parameters
     * @param params - json object that contains the query parameters
     * @returns
     */
    async queryItems(
        params: Partial<Omit<QueryCommandInput, "TableName">>,
    ): Promise<RunningInstance[]> {
        const command = new QueryCommand({
            TableName: this.tableName,
            ...params,
        });

        try {
            const result = await this.client.send(command);
            return result.Items?.map((item) => unmarshall(item) as RunningInstance) || [];
        } catch (error) {
            throw new Error(
                `Failed to query instances: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
        }
    }

    /**
     * query items by status. The table should have a global secondary index on the status field.
     * @param status - The status to query by
     * @returns The items matching the status
     */
    async queryItemsByStatus(
        status: "running" | "stopped" | "terminated",
    ): Promise<RunningInstance[]> {
        return this.queryItems({
            IndexName: "StatusCreationTimeIndex",
            KeyConditionExpression: "#status = :status",
            ExpressionAttributeNames: { "#status": "status" },
            ExpressionAttributeValues: marshall({ ":status": status }),
        });
    }

    /**
     * query items by region. The table should have a global secondary index on the region field.
     * @param region - The region to query by
     * @returns The items matching the region
     */
    async queryItemsByRegion(region: string): Promise<RunningInstance[]> {
        return this.queryItems({
            IndexName: "RegionIndex",
            KeyConditionExpression: "#region = :region",
            ExpressionAttributeNames: { "#region": "region" },
            ExpressionAttributeValues: marshall({ ":region": region }),
        });
    }
}

/**
 * Factory function to create a DynamoDB wrapper for a given table type
 * @param tableType - The type of table to create a wrapper for ("streams" or "instances")
 * @param table - The DynamoDB table to wrap
 * @returns The appropriate DynamoDB wrapper for the given table type
 */
export function createDynamoDbWrapper(
    tableType: "streams" | "instances",
    table: Table,
): DynamoDbWrapper<DynamoItem> {
    switch (tableType) {
        case "streams":
            return new RunningStreamWrapper(table);
        case "instances":
            return new RunningInstanceWrapper(table);
        default:
            throw new Error(`Unknown table type: ${tableType}`);
    }
}
