import {
    AttachVolumeCommandInput,
    EC2Client,
    CreateVolumeCommand,
    AttachVolumeCommand,
    DescribeVolumesCommand,
    ModifyInstanceAttributeCommand,
    type CreateVolumeRequest,
    type CreateVolumeCommandOutput,
    type AttachVolumeCommandOutput,
    type ModifyInstanceAttributeCommandInput,
    VolumeType,
    DetachVolumeCommand,
    type Filter,
} from "@aws-sdk/client-ec2";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

import DynamoDBWrapper from "./dynamoDbWrapper";
import EC2Wrapper from "./ec2Wrapper";

export interface CreateVolumeCommandConfig {
    userId: string;
    availabilityZone?: string;
    size?: number;
    volumeType?: VolumeType;
    tags?: Record<string, string>;
}

export interface EBSVolumeResult {
    volumeId: string;
    status: EBSStatusEnum;
}

export enum EBSStatusEnum {
    ERROR = "error",
    CREATING = "creating",
    AVAILABLE = "available",
    IN_USE = "in-use",
}

export interface DetachResult {
  volumeId: string;
  state: string;                    
  instanceId: string;               
}

// NOTE: AWS configures EBS size based on GiB, not GB. So just leaving this here in case we need to convert
const GBtoGIBConversion: number = 1.074

class EBSWrapper {
    private client: EC2Client;
    private dynamoClient: DynamoDBDocumentClient;
    private region: string = "us-east-1";
    private size: number = 100; // default
    private type: VolumeType = "gp3"; // default
    private tableName: string;

    // leaving optional call to size here for future config
    constructor(region?: string, size?: number, tableName?: string) {
        this.client = new EC2Client({ region });

        const ddbClient = new DynamoDBClient({ region });
        this.dynamoClient = DynamoDBDocumentClient.from(ddbClient);

        this.region = region || process.env.CDK_DEFAULT_REGION || "us-east-1";
        this.size = size ?? this.size;
        this.tableName = tableName || process.env.RUNNING_INSTANCES_TABLE || "RunningInstances";
    }

    async createAndAttachEBSVolume(
        config: CreateVolumeCommandConfig,
        instanceId: string,
    ): Promise<EBSVolumeResult> {
        try {
            const existingInstance = await this.checkExistingInstance(config.userId);

            // if user already has a running instance, stop
            if (existingInstance) {
                throw new Error(`User ${config.userId} already has an active instance`);
            }

            const volume = await this.createAndWaitForEBSVolume(config);
            if (!volume.volumeId) {
                throw new Error("Volume creation failed - no VolumeId returned");
            }
            const response = await this.attachAndWaitForEBSVolume(instanceId, volume.volumeId);

            return response;
        } catch (err: unknown) {
            console.log("region is missing?", this.region);
            throw err;
        }
    }

    private async checkExistingInstance(userId: string): Promise<boolean> {
        try {
            const dynamoDbWrapper = new DynamoDBWrapper(this.tableName);
            const instance = await dynamoDbWrapper.getItem({ userId: userId });
            if (instance && instance.status === "running") {
                return true;
            }
            return false;
        } catch (err: unknown) {
            console.error(`Failed to check existing instance for user ${userId}:`, err);
            throw err;
        }
    }

    async createAndWaitForEBSVolume(config: CreateVolumeCommandConfig): Promise<EBSVolumeResult> {
        try {
            const volume = await this.createEBSVolume(config);
            if (!volume.VolumeId) {
                throw new Error("Volume creation failed - no VolumeId returned");
            }
            const status = await this.waitForEBSVolume(
                volume.VolumeId,
                300,
                EBSStatusEnum.AVAILABLE,
            );
            return {
                volumeId: volume.VolumeId,
                status,
            };
        } catch (err: unknown) {
            console.error(`Failed to create EBS volume for user ${config.userId}:`, err);
            throw err;
        }
    }

    async attachAndWaitForEBSVolume(
        instanceId: string,
        volumeId: string,
    ): Promise<EBSVolumeResult> {
        try {
            await this.attachEBSVolume(instanceId, volumeId);
            const status = await this.waitForEBSVolume(volumeId, 300, EBSStatusEnum.IN_USE);
            return {
                volumeId: volumeId,
                status: status,
            };
        } catch (err: unknown) {
            console.error(`Failed to attach volume ${volumeId} to instance ${instanceId}:`, err);
            throw err;
        }
    }

    async createEBSVolume(config: CreateVolumeCommandConfig): Promise<CreateVolumeCommandOutput> {
        try {
            const {
                userId,
                availabilityZone = this.region,
                size = this.size,
                volumeType = this.type,
                tags = {},
            } = config;

            const tagSpecs: CreateVolumeRequest["TagSpecifications"] = [
                {
                    ResourceType: "volume",
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

            const input: CreateVolumeRequest = {
                AvailabilityZone: availabilityZone,
                Size: size,
                VolumeType: volumeType,
                TagSpecifications: tagSpecs,
            };

            const createVolumeCommand = new CreateVolumeCommand(input);
            const createVolumeResponse = await this.client.send(createVolumeCommand);
            return createVolumeResponse;
        } catch (err: unknown) {
            switch ((err as { name?: string }).name) {
                case "InsufficientVolumeCapacity":
                    throw new Error(
                        "Cannot create volume: There is not enough capacity to fulfill the EBS volume provision request",
                    );
                default:
                    console.error("Failed to create EBS volume:", err);
                    throw err;
            }
        }
    }

    async attachEBSVolume(
        instanceId: string,
        volumeId: string,
    ): Promise<AttachVolumeCommandOutput> {
        try {
            const attachEBSInput: AttachVolumeCommandInput = {
                InstanceId: instanceId,
                VolumeId: volumeId,
                Device: "/dev/sdf",
            };
            const attachEBSCommand = new AttachVolumeCommand(attachEBSInput);
            const response = await this.client.send(attachEBSCommand);

            // set DeleteOnTermination to false
            const modifyEBSInput: ModifyInstanceAttributeCommandInput = {
                InstanceId: instanceId,
                BlockDeviceMappings: [
                    {
                        DeviceName: "/dev/sdf",
                        Ebs: {
                            DeleteOnTermination: false,
                        },
                    },
                ],
            };
            const modifyEBSCommand = new ModifyInstanceAttributeCommand(modifyEBSInput);
            await this.client.send(modifyEBSCommand);
            return response;
        } catch (err: unknown) {
            console.error(`Failed to attach volume ${volumeId} to instance ${instanceId}:`, err);
            throw err;
        }
    }

    async waitForEBSVolume(
        volumeId: string,
        maxWaitTimeSeconds: number = 300,
        status: EBSStatusEnum,
    ): Promise<EBSStatusEnum> {
        const startTime = Date.now();
        const pollInterval = 5000;
        const maxWaitTime = maxWaitTimeSeconds * 1000;

        while (Date.now() - startTime < maxWaitTime) {
            const command = new DescribeVolumesCommand({ VolumeIds: [volumeId] });
            const response = await this.client.send(command);

            // check if the command status matches what we need
            const volumeState = response.Volumes?.[0]?.State;

            if (!volumeState) {
                throw new Error(`Volume ${volumeId} not found`);
            }

            if (volumeState === "error") {
                throw new Error(`Volume ${volumeId} entered error state`);
            }

            if (volumeState === status) {
                console.log(`Volume ${volumeId} is now ${status}`);
                return volumeState as EBSStatusEnum;
            }

            await new Promise((resolve) => setTimeout(resolve, pollInterval));
        }

        throw new Error(
            `Timeout: Volume ${volumeId} did not become ${status} within ${maxWaitTimeSeconds} seconds`,
        );
    }

    /**
     * Searches for an existing available EBS volume by userId tag
     */
    async getVolumeByUserId(userId: string): Promise<string | null> {
        try {
            const filters: Filter[] = [
                {
                    Name: "tag:userId",
                    Values: [userId],
                },
                {
                    Name: "tag:managed-by",
                    Values: ["lunaris"],
                },
                {
                    Name: "status",
                    Values: ["available"], // only return volumes that are not attached
                },
            ];

            const command = new DescribeVolumesCommand({
                Filters: filters,
            });

            const response = await this.client.send(command);

            // return volume if found
            const volume = response.Volumes?.[0];
            if (volume && volume.VolumeId) {
                return volume.VolumeId;
            }

            return null;
        } catch (error: unknown) {
            console.error(`Error searching for volume by userId ${userId}:`, error);
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to search for volume: ${message}`);
        }
    }

    /**
     * Attaches an existing volume to an instance, or creates a new one if none found
     */
    async attachOrReuseVolume(
        config: CreateVolumeCommandConfig,
        instanceId: string,
    ): Promise<EBSVolumeResult> {
        const hasRunningInstance = await this.checkExistingInstance(config.userId);

        if (hasRunningInstance) throw new Error(`User ${config.userId} already has an active ebs`);

        const existingVolumeId = await this.getVolumeByUserId(config.userId);

        if (existingVolumeId) {
            // reuse existing volume
            const attachResult = await this.attachAndWaitForEBSVolume(instanceId, existingVolumeId);
            return attachResult;
        } else {
            // spin up new volume
            const createResult = await this.createAndAttachEBSVolume(config, instanceId);
            return createResult;
        }
    }


    // --- Detach volume ---

    // Detach a single volume from the instance
    async detachEBSVolume(volumeId:string, instanceId: string): Promise<DetachResult> {
        try {

            const command = new DetachVolumeCommand({
            VolumeId: volumeId,
            InstanceId: instanceId,
            Force: false // Graceful detach
            });

            const response = await this.client.send(command);
            
            console.log(`Detaching volume ${volumeId} from instance ${instanceId}...`);

            return {
            volumeId: response.VolumeId || volumeId,
            state: response.State || "unknown",
            instanceId: response.InstanceId || instanceId
            };
        } catch (error: any) {
            console.error(`Failed to detach volume ${volumeId}:`, error);
            if (error.code === 'VolumeInUse') {
                throw new Error(`The volume ${volumeId} is currently in use and cannot be detached.`);
            } else if (error.code === 'InvalidVolume.NotFound') {
                throw new Error(`The specified volume ${volumeId} was not found.`);
            } else {
                throw error; 
            }
        }
    }
}   

export default EBSWrapper;
