import { _InstanceType } from "@aws-sdk/client-ec2";
import EC2Wrapper, { EC2InstanceResult, type EC2InstanceConfig } from "../../utils/ec2Wrapper";
import IAMWrapper from "../../utils/iamWrapper";
import DCVWrapper from "../../utils/dcvWrapper";
import SSMWrapper from "../../utils/ssmWrapper";
import EBSWrapper from "../../utils/ebsWrapper";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import DynamoDBWrapper from "../../utils/dynamoDbWrapper";

// Context object passed through deployment steps
type DeploymentContext = {
    userId: string;
    instanceType?: _InstanceType;
    amiId: string | undefined;
    ec2Wrapper: EC2Wrapper;
    ebsWrapper: EBSWrapper;
    ssmWrapper: SSMWrapper;
    db: DynamoDBWrapper;
};

type DeployEc2Event = {
    userId: string;
    instanceType?: _InstanceType;
};

type DeployEC2Success = {
    success: boolean;

    instanceId: string;
    publicIp?: string;
    privateIp?: string;
    instanceArn: string;

    state?: string;
    createdAt?: string;
    streamingUrl: string;
};

type DeployEC2Error = {
    success: false;
    error: string;
};

const AMI_ID_KEY = "ami_id";

export const handler = async (
    event: DeployEc2Event,
): Promise<DeployEC2Success | DeployEC2Error> => {
    try {
        const ctx = await initializeDeploymentContext(event);

        const { instance } = await createEC2Instance(ctx);

        const volumeResult = await ctx.ebsWrapper.attachOrReuseVolume(
            { userId: ctx.userId },
            instance.instanceId,
        );

        const dcvUrl = await createDCVSession(ctx, instance);

        await createAMISnapshotIfNeeded(ctx, instance);

        await saveDeploymentToDB(ctx, instance, volumeResult.volumeId, dcvUrl);

        return {
            success: true,
            instanceId: instance.instanceId,
            publicIp: instance.publicIp,
            privateIp: instance.privateIp,
            instanceArn: instance.instanceArn,

            state: instance.state,
            createdAt: instance.createdAt,
            streamingUrl: dcvUrl,
        };
    } catch (err: unknown) {
        if (err instanceof Error) {
            console.error("Instance deployment failed:", err);
            return {
                success: false,
                error: err.message || "Unknown error during instance creation",
            };
        }

        return { success: false, error: String(err) };
    }
};

/**
 * Inits all wrappers and fetches deployment config
 */
async function initializeDeploymentContext(event: DeployEc2Event): Promise<DeploymentContext> {
    const ssmWrapper = new SSMWrapper();
    const amiId = await ssmWrapper.getParamFromParamStore(AMI_ID_KEY);

    const ec2Wrapper = new EC2Wrapper();
    const ebsWrapper = new EBSWrapper(
        process.env.CDK_DEFAULT_REGION,
        undefined,
        process.env.RUNNING_INSTANCES_TABLE,
    );

    const dbWrapper = new DynamoDBWrapper(process.env.RUNNING_INSTANCES_TABLE || "RunningStreams");

    return {
        userId: event.userId,
        instanceType: event.instanceType,
        amiId: amiId,
        ec2Wrapper: ec2Wrapper,
        ebsWrapper: ebsWrapper,
        ssmWrapper: ssmWrapper,
        db: dbWrapper,
    };
}

/**
 * Create EC2 with IAM profile and config
 */
async function createEC2Instance(
    ctx: DeploymentContext,
): Promise<{ instance: EC2InstanceResult; iamProfileArn: string }> {
    const iamWrapper = new IAMWrapper();
    const iamProfileArn = await iamWrapper.getProfile();

    // Small delay to allow IAM profile to propagate
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const instanceConfig: EC2InstanceConfig = {
        userId: ctx.userId,
        instanceType: ctx.instanceType,
        securityGroupIds: process.env.SECURITY_GROUP_ID
            ? [process.env.SECURITY_GROUP_ID]
            : undefined,
        iamInstanceProfile: iamProfileArn,
        amiId: ctx.amiId,
        subnetId: process.env.SUBNET_ID,
        keyName: process.env.KEY_PAIR_NAME,
    };

    const instance = await ctx.ec2Wrapper.createAndWaitForInstance(instanceConfig);

    return { instance, iamProfileArn };
}

/**
 * Create DCV for given EC2 instance
 */
async function createDCVSession(
    ctx: DeploymentContext,
    instance: EC2InstanceResult,
): Promise<string> {
    const dcvWrapper = new DCVWrapper(instance.instanceId, ctx.userId);
    return await dcvWrapper.getDCVSession();
}

/**
 * Creates AMI snapshot if one doesn't exist in parameter store
 */
async function createAMISnapshotIfNeeded(
    ctx: DeploymentContext,
    instance: EC2InstanceResult,
): Promise<void> {
    if (!ctx.amiId) {
        const newAmiId = await ctx.ec2Wrapper.snapshotAMIImage(instance.instanceId, ctx.userId);
        await ctx.ssmWrapper.putParamInParamStore(AMI_ID_KEY, newAmiId);
    }
}

/**
 * Saves instance deployment info to RunningInstancesTable
 */
async function saveDeploymentToDB(
    ctx: DeploymentContext,
    instance: EC2InstanceResult,
    volumeId: string,
    dcvUrl: string,
): Promise<void> {
    const putCommand = new PutCommand({
        TableName: ctx.db.getTableName(),
        Item: {
            instanceId: instance.instanceId,
            userId: ctx.userId,
            instanceArn: instance.instanceArn,
            publicIp: instance.publicIp,
            privateIp: instance.privateIp,
            ebsVolumeId: volumeId,
            dcvUrl: dcvUrl,
            status: "running",
            createdAt: instance.createdAt,
            instanceType: ctx.instanceType,
            amiId: ctx.amiId,
        },
    });

    try {
        await ctx.db.putItem(putCommand);
        console.log(`Logged instance ${instance.instanceId} to DynamoDB`);
    } catch (error: unknown) {
        console.error("DynamoDB write failed:", error);
        if (error instanceof Error) {
            throw new Error(`DynamoDB write failed: ${error.message}`);
        }
        throw new Error(`Unknown Error: ${error}`);
    }
}
