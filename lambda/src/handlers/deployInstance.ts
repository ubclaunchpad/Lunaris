import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { EC2Client, RunInstancesCommand, _InstanceType } from "@aws-sdk/client-ec2";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const ec2Client = new EC2Client({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

interface DeployInstanceRequest {
    userId: string;
    instanceType?: string;
    amiId?: string;
}

// TODO: may have to update this if requirements change
interface DeployInstanceContext {
    invokedFunctionArn: string;
}

export const handler = async (
    event: APIGatewayProxyEvent,
    context: DeployInstanceContext,
): Promise<APIGatewayProxyResult> => {
    try {
        const body: DeployInstanceRequest = JSON.parse(event.body || "{}");
        const { userId, instanceType = "t3.micro", amiId } = body;

        const runningInstancesTable = process.env.RUNNING_INSTANCES_TABLE;
        if (!runningInstancesTable) {
            throw new Error("MissingRunningInstancesTable");
        }

        if (!userId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: "User ID is required" }),
            };
        }

        if (!amiId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: "AMI ID is required" }),
            };
        }

        // Start EC2 instance
        const runInstancesCommand = new RunInstancesCommand({
            ImageId: amiId,
            InstanceType: instanceType as _InstanceType,
            MinCount: 1,
            MaxCount: 1,
            TagSpecifications: [
                {
                    ResourceType: "instance",
                    Tags: [
                        { Key: "UserId", Value: userId },
                        { Key: "ManagedBy", Value: "Lunaris" },
                    ],
                },
            ],
        });

        const runInstancesResponse = await ec2Client.send(runInstancesCommand);
        const instance = runInstancesResponse.Instances?.[0];

        if (!instance || !instance.InstanceId) {
            throw new Error("Failed to create EC2 instance");
        }

        const now = new Date().toISOString();

        // Log to RunningInstances table
        const putCommand = new PutCommand({
            TableName: runningInstancesTable,
            Item: {
                instanceId: instance.InstanceId,
                instanceArn:
                    instance.InstanceId && context.invokedFunctionArn
                        ? `arn:aws:ec2:${context.invokedFunctionArn.split(":")[3]}:${context.invokedFunctionArn.split(":")[4]}:instance/${instance.InstanceId}`
                        : "",
                ebsVolumes:
                    instance.BlockDeviceMappings?.map((bdm) => bdm.Ebs?.VolumeId).filter(
                        (id): id is string => Boolean(id),
                    ) || [],
                creationTime: now,
                status: instance.State?.Name || "pending",
                region: instance.Placement?.AvailabilityZone || "unknown",
                instanceType: instance.InstanceType || instanceType,
                lastModifiedTime: now,
                userId: userId,
            },
        });

        await docClient.send(putCommand);

        console.log(`Successfully deployed instance ${instance.InstanceId} for user ${userId}`);

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: "Instance deployed successfully",
                instanceId: instance.InstanceId,
                status: instance.State?.Name,
            }),
        };
    } catch (error) {
        console.error("Error deploying instance:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: "Failed to deploy instance",
                error: error instanceof Error ? error.message : "Unknown error",
            }),
        };
    }
};
