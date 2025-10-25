import { Construct } from "constructs";
import {
  Table,
  AttributeType,
  BillingMode,
  ProjectionType,
} from "aws-cdk-lib/aws-dynamodb";
import { RemovalPolicy } from "aws-cdk-lib";

export class DynamoDbTables extends Construct {
    public RunningStreamsTable: Table;
    public runningInstancesTable: Table;

    constructor(scope: Construct, id: string) {
        super(scope, id);
        this.setUpRunningStreamsTable();
        this.setupRunningInstances()
    }

    /*
      * RunningStreams Table Schema:
      * - instanceArn (string) - Partition Key
      * - userId (string)
      * - streamingId (string)
      * - streamingLink (string)
      * - createdAt (ISO 8601 formatted date string)
      * - updatedAt (ISO 8601 formatted date string)
    */
    setUpRunningStreamsTable(): void {
        this.RunningStreamsTable = new Table(this, "RunningStreams", {
            partitionKey: {name: "instanceArn", type: AttributeType.STRING},
            billingMode: BillingMode.PAY_PER_REQUEST,
            removalPolicy: RemovalPolicy.DESTROY, // Use RETAIN for production
        });
    }

    /**
     * Schema: instanceId (PK), instanceArn, ebsVolumes (list), creationTime,
     *         status, region, instanceType, lastModifiedTime
     */
    setupRunningInstances(): void {
        this.runningInstancesTable = new Table(this, "RunningInstances", {
            partitionKey: {name: "instanceId", type: AttributeType.STRING},
            pointInTimeRecovery: true,
            billingMode: BillingMode.PAY_PER_REQUEST,
            // TODO: add environment based removal policy config
            removalPolicy: RemovalPolicy.DESTROY, // Use RETAIN for production
        });

    // TODO future: add autoscaling group
    // TODO: or add grantX to specific lambda functions

        this.runningInstancesTable.addGlobalSecondaryIndex({
            indexName: "StatusCreationTimeIndex",
            partitionKey: {name: "status", type: AttributeType.STRING},
            sortKey: {name: "creationTime", type: AttributeType.STRING}, projectionType: ProjectionType.ALL,
        });
    }
}
