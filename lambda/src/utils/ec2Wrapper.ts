import {
    EC2Client,
    RunInstancesCommand,
    DescribeInstancesCommand,
    waitUntilInstanceRunning,
    CreateImageCommand,
    type CreateImageCommandInput,
    type RunInstancesCommandInput,
    type Instance,
    type _InstanceType,
    CreateTagsCommand,
} from "@aws-sdk/client-ec2";
import { generateArn } from "./generateArn";

export interface EC2InstanceConfig {
    userId: string;

    instanceType?: _InstanceType; // e.g., "t3.medium", "g4dn.xlarge"

    keyName?: string;
    securityGroupIds?: string[];
    subnetId?: string;
    iamInstanceProfile?: string;
    amiId?: string;

    tags?: Record<string, string>;
}

export interface EC2InstanceResult {
    instanceId: string;
    publicIp?: string;
    privateIp?: string;
    state: string;
    createdAt: string;
    instanceArn: string;
}

const DEFAULT_INSTANCE_TYPE = "t3.medium";

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
            instanceType = DEFAULT_INSTANCE_TYPE,
            keyName,
            securityGroupIds,
            subnetId,
            amiId,
            tags = {},
        } = config;

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
                    {
                        Key: "dcvConfigured",
                        Value: amiId ? "true" : "false",
                    },
                    ...Object.entries(tags).map(([key, value]) => ({ Key: key, Value: value })),
                ],
            },
        ];
        const input: RunInstancesCommandInput = {
            // use launch template w/ preinstalled DCV
            LaunchTemplate: {
                LaunchTemplateName: "BasicDCV",
            },
            InstanceType: instanceType, // optional override
            MinCount: 1,
            MaxCount: 1,
            TagSpecifications: tagSpecifications,
            ImageId: amiId,
        };

        if (keyName) input.KeyName = keyName;
        if (securityGroupIds && securityGroupIds.length > 0)
            input.SecurityGroupIds = securityGroupIds;
        if (subnetId) input.SubnetId = subnetId;

        return input;
    }

    async createInstance(config: EC2InstanceConfig): Promise<EC2InstanceResult> {
        if (!config.userId || config.userId.trim() === "") {
            throw new Error("userId is required and cannot be empty");
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
