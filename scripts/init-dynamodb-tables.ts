import {
    DynamoDBClient,
    CreateTableCommand,
    ListTablesCommand,
    CreateTableCommandInput,
} from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({
    region: "us-east-1", // arbitrary region for local testing
    endpoint: "http://localhost:8000",
    credentials: {
        accessKeyId: "dummy",
        secretAccessKey: "dummy",
    },
});

async function createRunningInstancesTable() {
    const tableParams: CreateTableCommandInput = {
        TableName: "RunningInstances",

        KeySchema: [{ AttributeName: "instanceId", KeyType: "HASH" }],

        AttributeDefinitions: [
            { AttributeName: "instanceId", AttributeType: "S" },
            { AttributeName: "status", AttributeType: "S" },
            { AttributeName: "creationTime", AttributeType: "S" },
            { AttributeName: "userId", AttributeType: "S" },
        ],

        GlobalSecondaryIndexes: [
            {
                IndexName: "StatusCreationTimeIndex",
                KeySchema: [
                    { AttributeName: "status", KeyType: "HASH" },
                    { AttributeName: "creationTime", KeyType: "RANGE" },
                ],
                Projection: {
                    ProjectionType: "ALL",
                },
            },
            {
                IndexName: "UserIdIndex",
                KeySchema: [{ AttributeName: "userId", KeyType: "HASH" }],
                Projection: {
                    ProjectionType: "ALL",
                },
            },
        ],

        // for consistency with remote schema definition
        BillingMode: "PAY_PER_REQUEST",
    };

    try {
        await client.send(new CreateTableCommand(tableParams));
    } catch (error: unknown) {
        // idempotency handling
        if (error instanceof Error && error.name === "ResourceInUseException") {
            console.log("RunningInstances table already exists (skipping)");
        } else {
            throw error;
        }
    }
}

async function createRunningStreamsTable() {
    const tableParams: CreateTableCommandInput = {
        TableName: "RunningStreams",

        KeySchema: [{ AttributeName: "instanceArn", KeyType: "HASH" }],

        AttributeDefinitions: [{ AttributeName: "instanceArn", AttributeType: "S" }],

        // for consistency with remote schema definition
        BillingMode: "PAY_PER_REQUEST",
    };

    try {
        await client.send(new CreateTableCommand(tableParams));
    } catch (error: unknown) {
        // idempotency handling
        if (error instanceof Error && error.name === "ResourceInUseException") {
            console.log("ℹRunningStreams table already exists (skipping)");
        } else {
            throw error;
        }
    }
}

async function verifyTables() {
    console.log("Verifying tables...");

    const result = await client.send(new ListTablesCommand({}));
    const tables = result.TableNames || [];

    console.log("Existing tables:", tables.join(", "));

    const requiredTables = ["RunningInstances", "RunningStreams"];
    const allExist = requiredTables.every((table) => tables.includes(table));

    if (!allExist) {
        console.log("Not all tables are present!\n");
    }
}

(async () => {
    try {
        console.log("Creating tables...\n");

        await createRunningInstancesTable();
        await createRunningStreamsTable();

        // await to prevent race conditions in local DynamoDB
        await verifyTables();

        console.log("Local database setup complete");
    } catch (error) {
        console.error("Error initializing tables:", error);
        process.exit(1);
    }
})();
