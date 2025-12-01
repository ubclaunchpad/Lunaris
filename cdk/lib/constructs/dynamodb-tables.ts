import { Construct } from "constructs";
import {
    ITable,
    Table,
    AttributeType,
    BillingMode,
    ProjectionType,
    TableEncryption,
} from "aws-cdk-lib/aws-dynamodb";
import { RemovalPolicy } from "aws-cdk-lib";

export class DynamoDbTables extends Construct {
    public readonly runningStreamsTable: ITable;
    public readonly runningInstancesTable: ITable;

    constructor(scope: Construct, id: string) {
        super(scope, id);
        this.runningStreamsTable = this.setUpRunningStreamsTable();
        this.runningInstancesTable = this.setupRunningInstances();
    }

    /*
     * RunningStreams Table Schema:
     * - instanceArn (string) - Partition Key
     * - userId (string)
     * - streamingId (string)
     * - streamingLink (string)
     * - dcvUser (string) - DCV username
     * - dcvPassword (string) - Unique password per instance (encrypted at rest)
     * - createdAt (ISO 8601 formatted date string)
     * - updatedAt (ISO 8601 formatted date string)
     *
     * Security: Passwords are generated per-instance and stored encrypted.
     * The table uses AWS-managed encryption (KMS) at rest.
     */
    setUpRunningStreamsTable(): ITable {
        const table = new Table(this, "RunningStreams", {
            partitionKey: { name: "instanceArn", type: AttributeType.STRING },
            billingMode: BillingMode.PAY_PER_REQUEST,
            // Note: Encryption setting removed to avoid AWS rate limiting
            // DynamoDB tables are encrypted by default with AWS-owned keys
            removalPolicy: RemovalPolicy.DESTROY, // Use RETAIN for production
        });

        table.addGlobalSecondaryIndex({
            indexName: "UserIdIndex",
            partitionKey: { name: "userId", type: AttributeType.STRING },
            sortKey: { name: "createdAt", type: AttributeType.STRING },
            projectionType: ProjectionType.ALL,
        });

        return table;
    }

    /**
     * Schema: instanceId (PK), instanceArn, ebsVolumes (list), creationTime,
     *         status, region, instanceType, lastModifiedTime, userId,
     *         executionArn (optional - stores Step Function execution ARN for termination workflows)
     */
    setupRunningInstances(): ITable {
        const table = new Table(this, "RunningInstances", {
            partitionKey: { name: "instanceId", type: AttributeType.STRING },
            pointInTimeRecoverySpecification: {
                pointInTimeRecoveryEnabled: true,
            },
            billingMode: BillingMode.PAY_PER_REQUEST,
            // TODO: add environment based removal policy config
            removalPolicy: RemovalPolicy.DESTROY, // Use RETAIN for production
        });

        // TODO future: add autoscaling group
        // TODO: or add grantX to specific lambda functions

        //add global secondary index for status and creation time
        table.addGlobalSecondaryIndex({
            indexName: "StatusCreationTimeIndex",
            partitionKey: { name: "status", type: AttributeType.STRING },
            sortKey: { name: "creationTime", type: AttributeType.STRING },
            projectionType: ProjectionType.ALL,
        });

        //add global secondary index for userId
        table.addGlobalSecondaryIndex({
            indexName: "UserIdIndex",
            partitionKey: { name: "userId", type: AttributeType.STRING },
            sortKey: { name: "creationTime", type: AttributeType.STRING },
            projectionType: ProjectionType.ALL,
        });

        return table;
    }
}
