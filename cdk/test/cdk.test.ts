import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { DynamoDbTables } from "../lib/constructs/dynamodb-tables";

describe("CDK Constructs", () => {
    let app: cdk.App;
    let stack: cdk.Stack;

    beforeEach(() => {
        app = new cdk.App();
        stack = new cdk.Stack(app, "TestStack");
    });

    test("creates DynamoDB tables with correct configuration", () => {
        const dynamoDbTables = new DynamoDbTables(stack, "TestDynamoDbTables");
        const template = Template.fromStack(stack);

        // Test RunningStreams table
        template.hasResourceProperties("AWS::DynamoDB::Table", {
            BillingMode: "PAY_PER_REQUEST",
            AttributeDefinitions: [
                {
                    AttributeName: "instanceArn",
                    AttributeType: "S",
                },
            ],
            KeySchema: [
                {
                    AttributeName: "instanceArn",
                    KeyType: "HASH",
                },
            ],
        });

        // Test RunningInstances table
        template.hasResourceProperties("AWS::DynamoDB::Table", {
            BillingMode: "PAY_PER_REQUEST",
            KeySchema: [
                {
                    AttributeName: "instanceId",
                    KeyType: "HASH",
                },
            ],
        });

        expect(dynamoDbTables.runningInstancesTable).toBeDefined();
        expect(dynamoDbTables.RunningStreamsTable).toBeDefined();
    });

    test("DynamoDB tables have correct removal policy", () => {
        new DynamoDbTables(stack, "TestDynamoDbTables");
        const template = Template.fromStack(stack);

        template.hasResource("AWS::DynamoDB::Table", {
            DeletionPolicy: "Delete",
        });
    });
});
