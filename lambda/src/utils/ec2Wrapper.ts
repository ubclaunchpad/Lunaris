import {
    EC2Client,
    RunInstancesCommand,
    DescribeInstancesCommand,
    waitUntilInstanceRunning,
    CreateImageCommand,
    type CreateImageCommandInput,
    waitUntilInstanceTerminated,
    waitUntilInstanceStopped,
    type RunInstancesCommandInput,
    type Instance,
    type InstanceStateName,
    type _InstanceType,
    CreateTagsCommand,
    TerminateInstancesCommand,
} from "@aws-sdk/client-ec2";
import { generateArn } from "./generateArn";

export interface EC2InstanceConfig {
    userId: string;
    amiId: string;
    instanceType?: _InstanceType;
    keyName?: string;
    securityGroupIds?: string[];
    subnetId?: string;
    iamInstanceProfile?: string;
    tags?: Record<string, string>;
    userDataScript?: string;
}

export interface EC2InstanceResult {
    instanceId: string;
    publicIp?: string;
    privateIp?: string;
    state: string;
    createdAt: string;
    instanceArn: string;
}

export interface InstanceDetails {
    instanceId?: string;
    state?: InstanceStateName;
    publicIp?: string;
    privateIp?: string;
    volumes: Array<{
        volumeId?: string;
        deviceName?: string;
        deleteOnTermination?: boolean;
    }>;
}

export interface TerminateResult {
    instanceId: string;
    state: string;
    wasAlreadyTerminated?: boolean;
}

const DEFAULT_INSTANCE_TYPE = "t3.small";

export enum ErrorMessages {
    INSTANCE_NOT_FOUND = "Instance does not exist or is not available",
    TERMINATION_FAILED = "Failed to terminate the instance",
    INSTANCE_ALREADY_TERMINATED = "Instance already terminated or terminating",
    WAIT_TERMINATION_FAILED = "Failed to wait for termination of the instance",
    FAILED_GET_INSTANCE_DETAILS = "Failed to retrieve instance details",
    MISSING_AMI_ID = "AMI ID is required for instance creation",
}

// EC2 Instances need custom IAM permissions
class EC2Wrapper {
    private client: EC2Client;
    private region: string;

    constructor(region?: string) {
        this.region = region || process.env.CDK_DEFAULT_REGION || "us-east-1";
        this.client = new EC2Client({ region: this.region });
    }

    private prepareInstanceInput(config: EC2InstanceConfig): RunInstancesCommandInput {
        const {
            userId,
            amiId,
            instanceType = DEFAULT_INSTANCE_TYPE,
            keyName,
            securityGroupIds,
            subnetId,
            iamInstanceProfile,
            userDataScript,
            tags = {},
        } = config;

        if (!amiId) {
            throw new Error(ErrorMessages.MISSING_AMI_ID);
        }

        const tagSpecifications: RunInstancesCommandInput["TagSpecifications"] = [
            {
                ResourceType: "instance",
                Tags: [
                    {
                        Key: "userId",
                        Value: userId,
                    },
                    {
                        Key: "managed-by",
                        Value: "lunaris",
                    },
                    {
                        Key: "createdAt",
                        Value: new Date().toISOString(),
                    },
                    {
                        Key: "purpose",
                        Value: "cloud-gaming",
                    },
                    ...Object.entries(tags).map(([key, value]) => ({ Key: key, Value: value })),
                ],
            },
        ];

        const input: RunInstancesCommandInput = {
            ImageId: amiId,
            InstanceType: instanceType,
            MinCount: 1,
            MaxCount: 1,
            TagSpecifications: tagSpecifications,
        };

        if (keyName) input.KeyName = keyName;
        if (securityGroupIds && securityGroupIds.length > 0)
            input.SecurityGroupIds = securityGroupIds;
        if (subnetId) input.SubnetId = subnetId;
        if (iamInstanceProfile) {
            input.IamInstanceProfile = { Name: iamInstanceProfile };
        }
        if (userDataScript) {
            // User data must be base64 encoded
            input.UserData = Buffer.from(userDataScript).toString("base64");
        }

        return input;
    }

    async createInstance(config: EC2InstanceConfig): Promise<EC2InstanceResult> {
        if (!config.userId || config.userId.trim() === "") {
            throw new Error("userId is required and cannot be empty");
        }

        if (!config.amiId || config.amiId.trim() === "") {
            throw new Error(ErrorMessages.MISSING_AMI_ID);
        }

        const input = this.prepareInstanceInput(config);
        const command = new RunInstancesCommand(input);

        try {
            const response = await this.client.send(command);

            const instance = response.Instances?.[0];
            if (!instance || !instance.InstanceId) throw new Error("No instances created");

            const instanceId = instance.InstanceId;

            if (!instanceId) throw new Error("Instance ID not found in response");

            return {
                instanceId: instanceId,
                publicIp: instance.PublicIpAddress,
                privateIp: instance.PrivateIpAddress,
                state: instance.State?.Name || "unknown",
                createdAt: new Date().toISOString(),
                instanceArn: generateArn(this.region, instanceId),
            };
        } catch (error: unknown) {
            switch ((error as { name?: string }).name) {
                case "InstanceLimitExceeded":
                    throw new Error("Cannot create instance: Account instance limit exceeded");
                case "InvalidSubnetID.NotFound":
                    throw new Error(`Subnet ID ${input.SubnetId} not found`);
                case "InvalidGroup.NotFound":
                    throw new Error("One or more security groups not found");
                case "InvalidKeyPair.NotFound":
                    throw new Error(`Key pair '${input.KeyName}' not found`);
                case "InvalidAMIID.NotFound":
                    throw new Error(`AMI ID not found`);
                default:
                    const message = error instanceof Error ? error.message : String(error);
                    throw new Error(`Failed to create EC2 instance: ${message}`);
            }
        }
    }

    async waitForInstanceRunning(
        instanceId: string,
        maxWaitTimeSeconds: number = 300,
    ): Promise<EC2InstanceResult> {
        try {
            // poll until instance is running
            await waitUntilInstanceRunning(
                {
                    client: this.client,
                    maxWaitTime: maxWaitTimeSeconds,
                },
                {
                    InstanceIds: [instanceId],
                },
            );

            const command = new DescribeInstancesCommand({
                InstanceIds: [instanceId],
            });
            const response = await this.client.send(command);

            const instance = response.Reservations?.[0]?.Instances?.[0];

            if (!instance) throw new Error(`Instance ${instanceId} not found`);

            const id = instance.InstanceId || instanceId;

            const createdAt = instance.LaunchTime?.toDateString() || new Date().toISOString();

            return {
                instanceId: id,
                publicIp: instance.PublicIpAddress,
                privateIp: instance.PrivateIpAddress,
                state: instance.State?.Name || "running",
                createdAt: createdAt,
                instanceArn: generateArn(this.region, instanceId),
            };
        } catch (error: unknown) {
            switch ((error as { name?: string }).name) {
                case "WaiterTimedOut":
                    throw new Error(
                        `Timeout waiting for instance ${instanceId} to reach running state`,
                    );
                default:
                    throw new Error(`Error waiting for instance ${instanceId}`);
            }
        }
    }

    async createAndWaitForInstance(
        config: EC2InstanceConfig,
        waitForRunning: boolean = true,
    ): Promise<EC2InstanceResult> {
        try {
            const instanceResult = await this.createInstance(config);
            if (waitForRunning) {
                return await this.waitForInstanceRunning(instanceResult.instanceId);
            }

            return instanceResult;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to create and wait for instance: ${errorMessage}`, {
                cause: error,
            });
        }
    }

    // --- EC2 Termination Functions ---
    async getInstanceDetails(instanceId: string): Promise<InstanceDetails> {
        try {
            const command = new DescribeInstancesCommand({ InstanceIds: [instanceId] });
            const response = await this.client.send(command);
            const instance = response.Reservations?.[0]?.Instances?.[0];

            if (!instance) throw new Error(`${ErrorMessages.INSTANCE_NOT_FOUND}: ${instanceId}`);

            return {
                instanceId: instance.InstanceId,
                state: instance.State?.Name as InstanceStateName,
                publicIp: instance.PublicIpAddress,
                privateIp: instance.PrivateIpAddress,
                volumes:
                    instance.BlockDeviceMappings?.map((bdm) => ({
                        volumeId: bdm.Ebs?.VolumeId,
                        deviceName: bdm.DeviceName,
                        deleteOnTermination: bdm.Ebs?.DeleteOnTermination,
                    })) || [],
            };
        } catch (error: unknown) {
            console.error(`${ErrorMessages.FAILED_GET_INSTANCE_DETAILS} for ${instanceId}:`, error);
            throw error;
        }
    }

    async canTerminate(instanceId: string): Promise<boolean> {
        try {
            const instanceDetails = await this.getInstanceDetails(instanceId);
            const currentState = instanceDetails.state;

            switch (currentState) {
                case "pending":
                    throw new Error("Instance is in a pending state and cannot be terminated yet");

                case "stopping":
                    console.log(
                        `Instance ${instanceId} is in stopping state. Waiting for it to stop...`,
                    );
                    // Wait for the instance to stop before terminating
                    const stopped = await this.handleStoppingState(instanceId);
                    return stopped;

                case "shutting-down":
                    console.log(
                        `Instance ${instanceId} is in shutting-down state. Already being terminated.`,
                    );
                    return false;

                case "terminated":
                    console.log(`Instance ${instanceId} is already terminated.`);
                    return false;

                case "running":
                case "stopped":
                    return true; // Safe to terminate if the instance is running or stopped

                default:
                    throw new Error(`Unknown or unsupported instance state: ${currentState}`);
            }
        } catch (error: unknown) {
            // If the instance does not exist, treat it as terminated
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes(ErrorMessages.INSTANCE_NOT_FOUND)) {
                console.log(`Instance ${instanceId} is already terminated.`);
                return false;
            }
            throw error;
        }
    }

    async handleStoppingState(
        instanceId: string,
        maxWaitTimeSeconds: number = 300,
    ): Promise<boolean> {
        console.log(`Instance ${instanceId} is in stopping state. Waiting for it to stop...`);

        try {
            await waitUntilInstanceStopped(
                { client: this.client, maxWaitTime: maxWaitTimeSeconds },
                { InstanceIds: [instanceId] },
            );
            console.log(`Instance ${instanceId} has stopped.`);
            return true;
        } catch (error) {
            console.error(`Error waiting for instance ${instanceId} to stop:`, error);
            throw new Error(`Timeout or error waiting for instance ${instanceId} to stop.`);
        }
    }

    // Terminate the instance
    async terminateInstance(instanceId: string): Promise<TerminateResult> {
        try {
            if (!(await this.canTerminate(instanceId))) {
                console.log(`${ErrorMessages.INSTANCE_ALREADY_TERMINATED} ${instanceId}`);
                return {
                    instanceId,
                    state: "terminated",
                    wasAlreadyTerminated: true,
                };
            }

            const command = new TerminateInstancesCommand({ InstanceIds: [instanceId] });
            const response = await this.client.send(command);
            const terminatedInstance = response.TerminatingInstances?.[0];

            if (!terminatedInstance) {
                throw new Error(ErrorMessages.TERMINATION_FAILED);
            }

            return {
                instanceId: terminatedInstance.InstanceId || instanceId,
                state: terminatedInstance.CurrentState?.Name as InstanceStateName,
                wasAlreadyTerminated: false,
            };
        } catch (error: unknown) {
            console.error(`${ErrorMessages.TERMINATION_FAILED} for ${instanceId}:`, error);
            throw error;
        }
    }

    // Wait for the instance to terminate
    async waitForTermination(
        instanceId: string,
        maxWaitTimeSeconds: number = 300,
    ): Promise<TerminateResult> {
        try {
            await waitUntilInstanceTerminated(
                { client: this.client, maxWaitTime: maxWaitTimeSeconds },
                { InstanceIds: [instanceId] },
            );

            const details = await this.getInstanceDetails(instanceId);

            return {
                instanceId,
                state: details.state || "unkown",
                wasAlreadyTerminated: false,
            };
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes(ErrorMessages.INSTANCE_NOT_FOUND)) {
                return { instanceId, state: "terminated", wasAlreadyTerminated: false };
            }
            console.error(`${ErrorMessages.WAIT_TERMINATION_FAILED} for ${instanceId}:`, error);
            throw new Error(`${ErrorMessages.WAIT_TERMINATION_FAILED}: ${errorMessage}`);
        }
    }

    // Terminate the instance and wait for termination
    async terminateAndWait(
        instanceId: string,
        maxWaitTimeSeconds: number = 300,
    ): Promise<TerminateResult> {
        console.log("Calling terminateInstance");
        const terminateResult = await this.terminateInstance(instanceId);

        if (terminateResult.wasAlreadyTerminated) return terminateResult;

        console.log("Calling waitUntilInstanceTerminated");
        return await this.waitForTermination(instanceId, maxWaitTimeSeconds);
    }

    async snapshotAMIImage(instanceId: string, userId: string): Promise<string> {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const imageName = userId
                ? `Lunaris-DCV-${userId}-${timestamp}`
                : `Lunaris-DCV-${instanceId}-${timestamp}`;
            const input: CreateImageCommandInput = {
                InstanceId: instanceId,
                Name: imageName,

                Description: `DCV gaming snapshot for ${userId || instanceId} - Created ${new Date().toISOString()}`,

                NoReboot: true,

                TagSpecifications: [
                    {
                        ResourceType: "image",
                        Tags: [
                            { Key: "Name", Value: imageName },
                            { Key: "CreatedBy", Value: "Lunaris" },
                            { Key: "CreatedAt", Value: new Date().toISOString() },
                            { Key: "SourceInstance", Value: instanceId },
                            { Key: "Purpose", Value: "cloud-gaming" },
                            { Key: "HasDCV", Value: "true" },
                            ...(userId ? [{ Key: "UserId", Value: userId }] : []),
                        ],
                    },
                    {
                        ResourceType: "snapshot",
                        Tags: [
                            { Key: "Name", Value: `${imageName}-snapshot` },
                            { Key: "CreatedBy", Value: "Lunaris" },
                            { Key: "SourceInstance", Value: instanceId },
                        ],
                    },
                ],
            };

            const command = new CreateImageCommand(input);
            const response = await this.client.send(command);

            if (!response.ImageId) {
                throw new Error(`AMI ID is undefined for this instance ${instanceId}`);
            }
            console.log(`Ami created: ${response.ImageId}`);
            return response.ImageId;
        } catch (error) {
            console.error("Unable to snapshot image:", instanceId, error);
            throw error;
        }
    }

    async getInstance(instanceId: string): Promise<Instance> {
        try {
            const command = new DescribeInstancesCommand({
                InstanceIds: [instanceId],
            });

            const response = await this.client.send(command);

            return response.Reservations![0].Instances![0];
        } catch (err: unknown) {
            throw err;
        }
    }

    async modifyInstanceTag(instanceId: string, key: string, value: string): Promise<void> {
        try {
            const command = new CreateTagsCommand({
                Resources: [instanceId],
                Tags: [
                    {
                        Key: key,
                        Value: value,
                    },
                ],
            });
            await this.client.send(command);
        } catch (err: unknown) {
            throw err;
        }
    }
}

export default EC2Wrapper;
