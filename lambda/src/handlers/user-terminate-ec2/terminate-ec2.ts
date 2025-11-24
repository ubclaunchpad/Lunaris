import EC2Wrapper from "../../utils/ec2Wrapper";
import EBSWrapper from "../../utils/ebsWrapper";
import { DetachResult } from '../../utils/ebsWrapper'; 
import DCVWrapper from "../../utils/dcvWrapper";
import DynamoDBWrapper from "../../utils/dynamoDbWrapper";

export interface TerminateEc2Event {
  userId: string;
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

async function validateInstance(
  table: DynamoDBWrapper,
  instanceId: string,
  userId: string
): Promise<any> {
  try {
    const instance = await table.getItem({ instanceId });
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }
    if (instance.userId !== userId) {
      throw new Error(`Instance does not belong to user ${userId}`);
    }
    return instance;
  } catch (error) {
    throw error;
  }
}


async function terminateWorkflow(instanceId: string, userId: string, runningInstancesTable: DynamoDBWrapper) {
  const dcvWrapper = new DCVWrapper(instanceId, userId);
  const ebsWrapper = new EBSWrapper();
  const ec2Wrapper = new EC2Wrapper();

  /// you can add "try catch" around this workflow if we want rollback mechanism

  const instanceDetails = await ec2Wrapper.getInstanceDetails(instanceId);
  const volumeId = instanceDetails.volumes[0]?.volumeId;

  if (!volumeId) {
    throw new Error('No volume found for instance');
  }

  // Stop DCV session
  const dcvResult = await dcvWrapper.stopDCVSession();

  // Detach EBS volume
  const detachResult = await ebsWrapper.detachEBSVolume(volumeId, instanceId);
    if (detachResult.state !== 'detached') {
    console.error(`Failed to detach volume ${volumeId}, current state: ${detachResult.state}`);  // Debugging info
    throw new Error(`Failed to detach volume ${volumeId}. Current state: ${detachResult.state}`);
  }

  // Terminate EC2 instance
  const terminateResult = await ec2Wrapper.terminateAndWait(instanceId, 300);
    
  // Update DynamoDB table
  try {
    await runningInstancesTable.updateItem(
      { instanceId },
      {
        UpdateExpression: `SET #status = :status, lastModifiedTime = :timestamp, terminatedAt = :timestamp`,
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':status': 'terminated',
          ':timestamp': new Date().toISOString()
        }
      }
    );
  } catch (error: any) {
    throw new Error(`Failed to update DynamoDB for instance ${instanceId}: ${error.message}`);
  }

  return {
    success: true,
    dcvStopped: dcvResult.stoppedSuccessfully,
    detachVolumeState: detachResult.state,
    terminateInstanceState: terminateResult.state,
    dynamoDbUpdateStatus: 'updated',
   message: dcvResult.stoppedSuccessfully
      ? `Instance ${instanceId} terminated successfully.` 
      : `Instance ${instanceId} terminated successfully. ${dcvResult.message}`, // Ensure message reflects termination success but includes DCV stop failure if necessary
  };
}

export const handler = async (event: TerminateEc2Event): Promise<TerminateEc2Result> => {
  try {
    const { userId, instanceArn } = event;
    if (!userId || !instanceArn) {
      return { success: false, error: 'userId and instanceArn are required' };
    }

    const instanceId = instanceArn.split("/").pop();
    if (!instanceId || instanceId === instanceArn) {
      return { success: false, error: 'Invalid instanceArn format' };
    }

    const runningInstancesTable = new DynamoDBWrapper(process.env.RUNNING_INSTANCES_TABLE || "RunningInstances");

    let runningInstance;
    runningInstance = await validateInstance(runningInstancesTable, instanceId, userId);
    if (runningInstance.status === 'terminated') {
      return { success: true, instanceId, message: `Instance ${instanceId} already terminated` };
    }

    return await terminateWorkflow(instanceId, userId, runningInstancesTable);
  } catch (error: any) {
     return {
            success: false,
            error: error.message || "Unknown error during instance creation",
        }
  }
};