import { _InstanceType } from "@aws-sdk/client-ec2";
import EC2Wrapper, { EC2InstanceResult, type EC2InstanceConfig } from "../../utils/ec2Wrapper";
import SSMWrapper from "../../utils/ssmWrapper";

type DeployEc2Event = {
    userId: string;
};

type DeployEC2Success = {
    success: boolean;
    instanceId: string;
    instanceArn: string;
    dcvIp: string;
    dcvPort: number;
    dcvUser: string;
    dcvPassword: string;
};

type DeployEC2Error = {
    success: false;
    error: string;
};
export const handler = async (
    event: DeployEc2Event,
): Promise<DeployEC2Success | DeployEC2Error> => {
    try {
        const ssmWrapper = new SSMWrapper();
        const amiId = await ssmWrapper.getParamFromParamStore("ami_id");
        
        if (!amiId) {
            throw new Error("AMI ID not found in Parameter Store");
        }

        const ec2Wrapper = new EC2Wrapper(process.env.LAMBDA_REGION || "us-west-2");

        const instanceConfig: EC2InstanceConfig = {
            userId: event.userId,
            amiId: amiId,
            securityGroupIds: process.env.SECURITY_GROUP_ID
                ? [process.env.SECURITY_GROUP_ID]
                : undefined,
            subnetId: process.env.SUBNET_ID,
            keyName: process.env.KEY_PAIR_NAME,
        };

        const instance = await ec2Wrapper.createAndWaitForInstance(instanceConfig);

        return {
            success: true,
            instanceId: instance.instanceId,
            instanceArn: instance.instanceArn,
            dcvIp: instance.publicIp || "",
            dcvPort: 8443,
            dcvUser: "Administrator",
            dcvPassword: process.env.DCV_PASSWORD || "",
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
