import EBSWrapper, { CreateVolumeCommandConfig, EBSStatusEnum } from "../../src/utils/ebsWrapper";
import { ec2Mock, dynamoDBDocumentMock, resetAllMocks } from "../__mocks__/aws-mocks";
import {
    CreateVolumeCommand,
    AttachVolumeCommand,
    DetachVolumeCommand,
    DescribeVolumesCommand,
    ModifyInstanceAttributeCommand,
    type CreateVolumeCommandOutput,
    type AttachVolumeCommandOutput,
    type DescribeVolumesCommandOutput,
    type DetachVolumeCommandOutput,
    type VolumeAttachmentState
} from "@aws-sdk/client-ec2";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

describe("EBSWrapper", () => {
    let ebsWrapper: EBSWrapper;

    const mockVolumeId = "vol-1234567890abcdef0";
    const mockInstanceId = "i-1234567890abcdef0";
    const mockUserId = "test-user-123";

    // mock responses:
    const createMockVolume = (
        overrides: Partial<CreateVolumeCommandOutput> = {},
    ): CreateVolumeCommandOutput => ({
        VolumeId: mockVolumeId,
        State: "creating",
        Size: 100,
        VolumeType: "gp3",
        AvailabilityZone: "us-east-1a",
        CreateTime: new Date("2024-01-01T00:00:00Z"),
        Attachments: [],
        Tags: [],
        Encrypted: false,
        Iops: 3000,
        SnapshotId: "",
        $metadata: {
            httpStatusCode: 200,
            requestId: "test-request-id",
            attempts: 1,
            totalRetryDelay: 0,
        },
        ...overrides,
    });

    const createMockAttachment = (
        overrides: Partial<AttachVolumeCommandOutput> = {},
    ): AttachVolumeCommandOutput => ({
        VolumeId: mockVolumeId,
        InstanceId: mockInstanceId,
        Device: "/dev/sdf",
        State: "attaching",
        AttachTime: new Date(),
        $metadata: {
            httpStatusCode: 200,
            requestId: "test-request-id",
            attempts: 1,
            totalRetryDelay: 0,
        },
        ...overrides,
    });

    const createMockDescribeVolumes = (state: EBSStatusEnum): DescribeVolumesCommandOutput => ({
        Volumes: [
            {
                VolumeId: mockVolumeId,
                State: state,
                Size: 100,
                VolumeType: "gp3",
                AvailabilityZone: "us-east-1a",
                CreateTime: new Date(),
                Attachments: [],
                Tags: [],
                Encrypted: false,
                Iops: 3000,
            },
        ],
        $metadata: {
            httpStatusCode: 200,
            requestId: "test-request-id",
            attempts: 1,
            totalRetryDelay: 0,
        },
    });

    const mockCreateVolumeSuccess = (
        volumeId = mockVolumeId,
        state: EBSStatusEnum = EBSStatusEnum.CREATING,
    ) => {
        ec2Mock
            .on(CreateVolumeCommand)
            .resolves(createMockVolume({ VolumeId: volumeId, State: state }));
    };

    const mockDescribeVolumesSuccess = (volumeId = mockVolumeId, state: EBSStatusEnum) => {
        ec2Mock.on(DescribeVolumesCommand).resolves(createMockDescribeVolumes(state));
    };

    const mockAttachVolumeSuccess = (volumeId = mockVolumeId, instanceId = mockInstanceId) => {
        ec2Mock
            .on(AttachVolumeCommand)
            .resolves(createMockAttachment({ VolumeId: volumeId, InstanceId: instanceId }));
    };

    const mockModifyInstanceSuccess = () => {
        ec2Mock.on(ModifyInstanceAttributeCommand).resolves({
            $metadata: {
                httpStatusCode: 200,
                requestId: "test-request-id",
                attempts: 1,
                totalRetryDelay: 0,
            },
        });
    };

    const mockDynamoGetSuccess = (hasExistingInstance = false) => {
        if (hasExistingInstance) {
            dynamoDBDocumentMock.on(GetCommand).resolves({
                Item: {
                    instanceId: mockInstanceId,
                    userId: mockUserId,
                    status: "running",
                },
                $metadata: {
                    httpStatusCode: 200,
                    requestId: "test-request-id",
                    attempts: 1,
                    totalRetryDelay: 0,
                },
            });
        } else {
            dynamoDBDocumentMock.on(GetCommand).resolves({
                Item: undefined,
                $metadata: {
                    httpStatusCode: 200,
                    requestId: "test-request-id",
                    attempts: 1,
                    totalRetryDelay: 0,
                },
            });
        }
    };

    // dont need for now
    const mockDynamoPutSuccess = () => {
        dynamoDBDocumentMock.on(PutCommand).resolves({
            $metadata: {
                httpStatusCode: 200,
                requestId: "test-request-id",
                attempts: 1,
                totalRetryDelay: 0,
            },
        });
    };

   const createMockDetachVolume = (state: VolumeAttachmentState): DetachVolumeCommandOutput => ({
        VolumeId: mockVolumeId,
        InstanceId: mockInstanceId,
        State: state,
        $metadata: {
            httpStatusCode: 200,
            requestId: 'test-request-id',
            attempts: 1,
            totalRetryDelay: 0
        }
    });

    const mockDetachVolumeSuccess = () => {
        ec2Mock.on(DetachVolumeCommand).resolves(createMockDetachVolume('detaching'));
    };

    const mockDetachVolumeFailure = (errorCode: string, errorMessage: string) => {
        const error = new Error(errorMessage) as Error & { code: string };
        error.code = errorCode;
        ec2Mock.on(DetachVolumeCommand).rejects(error);
    };

    beforeEach(() => {
        resetAllMocks();
        jest.clearAllMocks();
        ebsWrapper = new EBSWrapper("us-east-1", 100, "RunningInstancesTable");
    });

    describe("createEBSVolume", () => {
        it("should create EBS volume with correct parameters", async () => {
            mockCreateVolumeSuccess();
            mockDynamoGetSuccess(false);

            const config: CreateVolumeCommandConfig = {
                userId: mockUserId,
                size: 100,
                volumeType: "gp3",
                tags: { environment: "test" },
            };

            const result = await ebsWrapper.createEBSVolume(config);

            expect(result.VolumeId).toBe(mockVolumeId);
            expect(result.State).toBe("creating");

            const calls = ec2Mock.commandCalls(CreateVolumeCommand);
            expect(calls).toHaveLength(1);

            const input = calls[0].args[0].input;
            expect(input.Size).toBe(100);
            expect(input.VolumeType).toBe("gp3");
        });

        it("should handle InsufficientVolumeCapacity error", async () => {
            const error = new Error("Insufficient capacity");
            error.name = "InsufficientVolumeCapacity";
            ec2Mock.on(CreateVolumeCommand).rejects(error);

            const config: CreateVolumeCommandConfig = {
                userId: mockUserId,
            };

            await expect(ebsWrapper.createEBSVolume(config)).rejects.toThrow(
                "Cannot create volume: There is not enough capacity",
            );
        });
    });

    describe("waitForEBSVolume", () => {
        it("should wait until volume becomes available", async () => {
            mockDescribeVolumesSuccess(mockVolumeId, EBSStatusEnum.AVAILABLE);

            const result = await ebsWrapper.waitForEBSVolume(
                mockVolumeId,
                300,
                EBSStatusEnum.AVAILABLE,
            );

            expect(result).toBe(EBSStatusEnum.AVAILABLE);
        });

        it("should throw error if volume not found", async () => {
            ec2Mock.on(DescribeVolumesCommand).resolves({
                Volumes: [],
                $metadata: {
                    httpStatusCode: 200,
                    requestId: "test-request-id",
                    attempts: 1,
                    totalRetryDelay: 0,
                },
            });

            await expect(
                ebsWrapper.waitForEBSVolume(mockVolumeId, 300, EBSStatusEnum.AVAILABLE),
            ).rejects.toThrow(`Volume ${mockVolumeId} not found`);
        });

        it("should throw error if volume enters error state", async () => {
            mockDescribeVolumesSuccess(mockVolumeId, EBSStatusEnum.ERROR);

            await expect(
                ebsWrapper.waitForEBSVolume(mockVolumeId, 300, EBSStatusEnum.AVAILABLE),
            ).rejects.toThrow(`Volume ${mockVolumeId} entered error state`);
        });
    });

    describe("attachEBSVolume", () => {
        it("should attach volume and set DeleteOnTermination to false", async () => {
            mockAttachVolumeSuccess();
            mockModifyInstanceSuccess();

            await ebsWrapper.attachEBSVolume(mockInstanceId, mockVolumeId);

            const attachCalls = ec2Mock.commandCalls(AttachVolumeCommand);
            expect(attachCalls).toHaveLength(1);
            expect(attachCalls[0].args[0].input).toMatchObject({
                InstanceId: mockInstanceId,
                VolumeId: mockVolumeId,
                Device: "/dev/sdf",
            });

            const modifyCalls = ec2Mock.commandCalls(ModifyInstanceAttributeCommand);
            expect(modifyCalls).toHaveLength(1);
        });
    });

    describe("createAndAttachEBSVolume", () => {
        it("should create and attach volume successfully", async () => {
            mockDynamoGetSuccess(false);
            mockCreateVolumeSuccess();

            let callCount = 0;
            ec2Mock.on(DescribeVolumesCommand).callsFake(() => {
                callCount++;
                const state = callCount <= 2 ? EBSStatusEnum.AVAILABLE : EBSStatusEnum.IN_USE;
                return Promise.resolve(createMockDescribeVolumes(state));
            });

            mockAttachVolumeSuccess();
            mockModifyInstanceSuccess();
            mockDynamoPutSuccess();

            const config: CreateVolumeCommandConfig = {
                userId: mockUserId,
                size: 100,
            };

            const result = await ebsWrapper.createAndAttachEBSVolume(config, mockInstanceId);

            expect(result.volumeId).toBe(mockVolumeId);
            expect(result.status).toBe(EBSStatusEnum.IN_USE);
        });
        it("should return error when there is already an existing Instance", async () => {
            mockDynamoGetSuccess(true);

            const config: CreateVolumeCommandConfig = {
                userId: mockUserId,
                size: 100,
            };

            await expect(
                ebsWrapper.createAndAttachEBSVolume(config, mockInstanceId),
            ).rejects.toThrow(`User ${mockUserId} already has an active instance`);

            const createVolumeCalls = ec2Mock.commandCalls(CreateVolumeCommand);
            expect(createVolumeCalls).toHaveLength(0);

            const attachVolumeCalls = ec2Mock.commandCalls(AttachVolumeCommand);
            expect(attachVolumeCalls).toHaveLength(0);
        });
    });

    describe("attachOrReuseVolume", () => {
        it("should reuse existing available volume when found", async () => {
            mockDynamoGetSuccess(false);
            mockAttachVolumeSuccess(mockVolumeId, mockInstanceId);
            mockModifyInstanceSuccess();
            mockDescribeVolumesSuccess(mockVolumeId, EBSStatusEnum.IN_USE);

            const result = await ebsWrapper.attachOrReuseVolume(
                { userId: mockUserId, availabilityZone: "us-east-1a" },
                mockInstanceId,
            );

            expect(result.status).toBe(EBSStatusEnum.IN_USE);
            expect(result.volumeId).toBe(mockVolumeId);

            const createCalls = ec2Mock.commandCalls(CreateVolumeCommand);
            expect(createCalls.length).toBe(0);

            const attachVolumeCalls = ec2Mock.commandCalls(AttachVolumeCommand);
            expect(attachVolumeCalls).toHaveLength(1);
        });

        it("should create new volumes when no existing volumes are found", async () => {
            const newVolumeId = "vol-new456";

            mockDynamoGetSuccess(false);
            ec2Mock
                .on(DescribeVolumesCommand)
                .resolvesOnce({ Volumes: [] })
                .resolvesOnce(createMockDescribeVolumes(EBSStatusEnum.AVAILABLE))
                .resolves(createMockDescribeVolumes(EBSStatusEnum.IN_USE));
            mockCreateVolumeSuccess(newVolumeId, EBSStatusEnum.CREATING);
            mockAttachVolumeSuccess(newVolumeId, mockInstanceId);
            mockModifyInstanceSuccess();

            const result = await ebsWrapper.attachOrReuseVolume(
                { userId: mockUserId, size: 100 },
                mockInstanceId,
            );

            expect(result.status).toBe(EBSStatusEnum.IN_USE);
            expect(result.volumeId).toBe(newVolumeId);

            const createCalls = ec2Mock.commandCalls(CreateVolumeCommand);
            expect(createCalls.length).toBe(1);
        });

        it("should throw error when user already has running instance", async () => {
            mockDynamoGetSuccess(true);

            await expect(
                ebsWrapper.attachOrReuseVolume(
                    { userId: mockUserId, availabilityZone: "us-east-1a" },
                    mockInstanceId,
                ),
            ).rejects.toThrow("already has an active ebs");
        });

        const attachVolumeCalls = ec2Mock.commandCalls(AttachVolumeCommand);
        expect(attachVolumeCalls).toHaveLength(0);

        const createCalls = ec2Mock.commandCalls(CreateVolumeCommand);
        expect(createCalls.length).toBe(0);
    });
    it("should handle errors when searching for volumes", async () => {
        mockDynamoGetSuccess(false);

        ec2Mock.on(DescribeVolumesCommand).rejects(new Error("AWS Error"));
        await expect(
            ebsWrapper.attachOrReuseVolume(
                { userId: mockUserId, availabilityZone: "us-east-1" },
                mockInstanceId,
            ),
        ).rejects.toThrow("Failed to search for volume");
    });

     describe('detachEBSVolume', () => {
        it('should detach the volume successfully', async () => {
            mockDetachVolumeSuccess();

            const result = await ebsWrapper.detachEBSVolume(mockVolumeId, mockInstanceId);

            expect(result.volumeId).toBe(mockVolumeId);
            expect(result.state).toBe('detaching');
            expect(result.instanceId).toBe(mockInstanceId);

            const detachCalls = ec2Mock.commandCalls(DetachVolumeCommand);
            expect(detachCalls).toHaveLength(1);
            expect(detachCalls[0].args[0].input).toMatchObject({
                VolumeId: mockVolumeId,
                InstanceId: mockInstanceId,
                Force: false
            });
        });

        it('should throw an error if the volume is in use', async () => {
            mockDetachVolumeFailure('VolumeInUse', 'The volume is in use');

            await expect(
                ebsWrapper.detachEBSVolume(mockVolumeId, mockInstanceId)
            ).rejects.toThrow(`The volume ${mockVolumeId} is currently in use and cannot be detached.`);
        });

        it('should throw an error if the volume is not found', async () => {
            mockDetachVolumeFailure('InvalidVolume.NotFound', 'The volume was not found');

            await expect(
                ebsWrapper.detachEBSVolume(mockVolumeId, mockInstanceId)
            ).rejects.toThrow(`The specified volume ${mockVolumeId} was not found.`);
        });

        it('should handle unknown errors gracefully', async () => {
            const error = new Error('Unknown error') as Error & { code: string };
            error.code = 'UnknownError';
            ec2Mock.on(DetachVolumeCommand).rejects(error);

            await expect(
                ebsWrapper.detachEBSVolume(mockVolumeId, mockInstanceId)
            ).rejects.toThrow('Unknown error');
        });

        it('should return the correct state even if there are no attachment details', async () => {
            const noAttachmentsMock = createMockDetachVolume('detaching');

            ec2Mock.on(DetachVolumeCommand).resolves(noAttachmentsMock);

            const result = await ebsWrapper.detachEBSVolume(mockVolumeId, mockInstanceId);

            expect(result.volumeId).toBe(mockVolumeId);
            expect(result.state).toBe('detaching');
            expect(result.instanceId).toBe(mockInstanceId);
        });
    });
});
