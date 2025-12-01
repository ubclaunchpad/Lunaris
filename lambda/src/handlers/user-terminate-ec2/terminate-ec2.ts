import EC2Wrapper from "../../utils/ec2Wrapper";
import EBSWrapper from "../../utils/ebsWrapper";
import DCVWrapper from "../../utils/dcvWrapper";
import DynamoDBWrapper from "../../utils/dynamoDbWrapper";

export interface TerminateEc2Event {
    userId: string;
    instanceId: string;
    instanceArn: string;
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

async function terminateWorkflow(
    instanceId: string,
    userId: string,
    runningInstancesTable: DynamoDBWrapper,
) {
    const dcvWrapper = new DCVWrapper(instanceId, userId);
    const ebsWrapper = new EBSWrapper();
    const ec2Wrapper = new EC2Wrapper();

    let dcvResult = { stoppedSuccessfully: false, message: "DCV stop skipped" };
    let detachResult = { state: "skipped" };

    try {
        // Get instance details to find volume
        const instanceDetails = await ec2Wrapper.getInstanceDetails(instanceId);
        const volumeId = instanceDetails.volumes[0]?.volumeId;

        // Stop DCV session (best effort - don't fail if it doesn't work)
        try {
            dcvResult = await dcvWrapper.stopDCVSession();
        } catch (dcvError) {
            console.warn("Failed to stop DCV session:", dcvError);
        }

        // Detach EBS volume if found (best effort for MVP)
        if (volumeId) {
            try {
                detachResult = await ebsWrapper.detachEBSVolume(volumeId, instanceId);
            } catch (detachError) {
                console.warn("Failed to detach volume:", detachError);
            }
        }
    } catch (detailsError) {
        console.warn("Failed to get instance details:", detailsError);
    }

    // Terminate EC2 instance - don't wait for full termination to avoid Lambda timeout
    // The instance will terminate in the background after the Lambda returns
    const terminateResult = await ec2Wrapper.terminateInstance(instanceId);

    // Update DynamoDB table (best effort - don't fail if record doesn't exist)
    let dynamoDbUpdateStatus = "skipped";
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
        dynamoDbUpdateStatus = "updated";
    } catch (error: unknown) {
        console.warn("Failed to update RunningInstances table (may not exist):", error);
        dynamoDbUpdateStatus = "not_found";
    }

    return {
        success: true,
        instanceId,
        dcvStopped: dcvResult.stoppedSuccessfully,
        detachVolumeState: detachResult.state,
        terminateInstanceState: terminateResult.state,
        dynamoDbUpdateStatus,
        message: `Instance ${instanceId} terminated successfully.`,
    };
}

export const handler = async (event: TerminateEc2Event): Promise<TerminateEc2Result> => {
    try {
        const { userId, instanceId, instanceArn } = event;

        // Validate required fields
        if (!userId) {
            throw new Error("userId is required");
        }

        // Get instanceId from event directly, or extract from instanceArn as fallback
        let resolvedInstanceId: string | undefined = instanceId;
        if (!resolvedInstanceId && instanceArn) {
            const parts = instanceArn.split("/");
            resolvedInstanceId = parts[parts.length - 1];
        }

        if (!resolvedInstanceId) {
            throw new Error("instanceId or instanceArn is required");
        }

        console.log(`Terminating instance ${resolvedInstanceId} for user ${userId}`);

        const runningInstancesTable = new DynamoDBWrapper(
            process.env.RUNNING_INSTANCES_TABLE || "RunningInstances",
        );

        // Skip validation - the CheckRunningStreams step already verified the instance exists
        // and belongs to the user via the RunningStreams table

        return await terminateWorkflow(resolvedInstanceId, userId, runningInstancesTable);
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Terminate error:", errorMessage);
        // Throw the error so Step Functions can catch it as a failure
        throw new Error(errorMessage || "Unknown error during instance termination");
    }
};
