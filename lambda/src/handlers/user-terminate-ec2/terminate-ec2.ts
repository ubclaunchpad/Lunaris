import EC2Wrapper from "../../utils/ec2Wrapper";
import EBSWrapper from "../../utils/ebsWrapper";
import DCVWrapper from "../../utils/dcvWrapper";
import DynamoDBWrapper from "../../utils/dynamoDbWrapper";
import { type GetCommandOutput } from "@aws-sdk/lib-dynamodb";

export interface TerminateEc2Event {
    userId: string;
}

export interface TerminateEc2Result {
    success: boolean;
    instanceId?: string;
    dcvStopped?: boolean;
    detachVolumeState?: string;
    terminateInstanceState?: string;
    dynamoDbUpdateStatus?: string;
    message?: string;
    error?: string;
}

async function findUserInstance(
    table: DynamoDBWrapper,
    userId: string,
): Promise<GetCommandOutput["Item"]> {
    const items = await table.queryByUserId(userId);

    if (!items || items.length === 0) {
        throw new Error(`No running instances found for user ${userId}`);
    }

    // Pick the newest instance by creationTime
    items.sort((a, b) => (b.creationTime || "").localeCompare(a.creationTime || ""));

    return items[0]; 
}

async function terminateWorkflow(
    instanceId: string,
    userId: string,
    runningInstancesTable: DynamoDBWrapper,
) {
    const dcvWrapper = new DCVWrapper(instanceId, userId);
    const ebsWrapper = new EBSWrapper();
    const ec2Wrapper = new EC2Wrapper();

    /// you can add "try catch" around this workflow if we want rollback mechanism

    const instanceDetails = await ec2Wrapper.getInstanceDetails(instanceId);
    const volumeId = instanceDetails.volumes[0]?.volumeId;

    if (!volumeId) {
        throw new Error("No volume found for instance");
    }

    // Stop DCV session
    const dcvResult = await dcvWrapper.stopDCVSession();

    // Detach EBS volume
    const detachResult = await ebsWrapper.detachEBSVolume(volumeId, instanceId);
    if (detachResult.state !== "detached") {
        console.error(`Failed to detach volume ${volumeId}, current state: ${detachResult.state}`); // Debugging info
        throw new Error(
            `Failed to detach volume ${volumeId}. Current state: ${detachResult.state}`,
        );
    }

    // Terminate EC2 instance
    const terminateResult = await ec2Wrapper.terminateAndWait(instanceId, 300);

    // Update DynamoDB table
    try {
        await runningInstancesTable.updateItem(
            { instanceId },
            {
                UpdateExpression: `SET #status = :status, lastModifiedTime = :timestamp, terminatedAt = :timestamp`,
                ExpressionAttributeNames: { "#status": "status" },
                ExpressionAttributeValues: {
                    ":status": "terminated",
                    ":timestamp": new Date().toISOString(),
                },
            },
        );
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to update DynamoDB for instance ${instanceId}: ${errorMessage}`);
    }

    return {
        success: true,
        dcvStopped: dcvResult.stoppedSuccessfully,
        detachVolumeState: detachResult.state,
        terminateInstanceState: terminateResult.state,
        dynamoDbUpdateStatus: "updated",
        message: dcvResult.stoppedSuccessfully
            ? `Instance ${instanceId} terminated successfully.`
            : `Instance ${instanceId} terminated successfully. ${dcvResult.message}`, // Ensure message reflects termination success but includes DCV stop failure if necessary
    };
}

export const handler = async (event: TerminateEc2Event): Promise<TerminateEc2Result> => {
    try {
        const { userId } = event;
        if (!userId) {
            return { success: false, error: "userId is required" };
        }

        const runningInstancesTable = new DynamoDBWrapper(
            process.env.RUNNING_INSTANCES_TABLE || "RunningInstances",
        );

        const runningInstance = await findUserInstance(runningInstancesTable, userId);

         if (!runningInstance) {
            throw new Error("No instance found for user");
        }
        if (runningInstance.userId !== userId) {
            throw new Error(`Instance does not belong to user ${userId}`);
        }       
        
        const instanceId = runningInstance.instanceId;

        if (runningInstance.status === "terminated") {
            return {
                success: true,
                instanceId,
                message: `Instance ${instanceId} already terminated`,
            };
        }

        return await terminateWorkflow(instanceId, userId, runningInstancesTable);
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            success: false,
            error: errorMessage || "Unknown error during instance creation",
        };
    }
};
