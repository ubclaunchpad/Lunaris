import {
    RunInstancesCommand,
    DescribeInstancesCommand,
    waitUntilInstanceRunning,
    CreateImageCommand,
    CreateTagsCommand
} from '@aws-sdk/client-ec2';
import EC2Wrapper, { EC2InstanceConfig } from '../../src/utils/ec2Wrapper';
import { ec2Mock, resetAllMocks } from '../__mocks__/aws-mocks';

jest.mock('@aws-sdk/client-ec2', () => {
    const actual = jest.requireActual('@aws-sdk/client-ec2');
    return {
        ...actual,
        waitUntilInstanceRunning: jest.fn(),
    };
});

describe('EC2Wrapper', () => {
    const createMockInstance = (overrides = {}) => ({
        InstanceId: 'i-1234567890abcdef0',
        State: { Name: 'pending' as const },
        InstanceType: 't3.micro' as const,
        Placement: { AvailabilityZone: 'us-east-1a' },
        BlockDeviceMappings: [],
        PublicIpAddress: '1.2.3.4',
        PrivateIpAddress: '10.0.0.1',
        LaunchTime: new Date(),
        ...overrides
    });

    const mockEC2Success = (instanceId = 'i-test123', overrides = {}) => {
        ec2Mock.on(RunInstancesCommand).resolves({
            Instances: [createMockInstance({ InstanceId: instanceId, ...overrides })]
        });
    };

    const mockWaiterSuccess = () => {
        (waitUntilInstanceRunning as jest.Mock).mockResolvedValueOnce({
            state: 'SUCCESS'
        });
    };

    const mockDescribeInstancesSuccess = (instanceId = 'i-test123', overrides = {}) => {
        ec2Mock.on(DescribeInstancesCommand).resolves({
            Reservations: [{
                Instances: [createMockInstance({
                    InstanceId: instanceId,
                    State: { Name: 'running' },
                    ...overrides
                })]
            }]
        });
    };

    beforeEach(() => {
        resetAllMocks();
        jest.clearAllMocks();
    });

    // TODO: test creating with ami
    describe('createInstance', () => {
        it('should create EC2 instance with all required fields', async () => {
            const mockInstanceId = 'i-test123';
            const mockConfig: EC2InstanceConfig = {
                userId: 'test-user-123',
                instanceType: 't3.medium',
            };

            mockEC2Success(mockInstanceId);

            const ec2Wrapper = new EC2Wrapper('us-east-1');
            const result = await ec2Wrapper.createInstance(mockConfig);

            expect(result.instanceId).toBe(mockInstanceId);
            expect(result.state).toBe('pending');
            expect(result.instanceArn).toContain(mockInstanceId);
            expect(result.instanceArn).toContain('us-east-1');
            expect(result.createdAt).toBeDefined();
            expect(result.publicIp).toBe('1.2.3.4');
            expect(result.privateIp).toBe('10.0.0.1');

            const calls = ec2Mock.commandCalls(RunInstancesCommand);
            expect(calls).toHaveLength(1);
            const input = calls[0].args[0].input;
            expect(input.InstanceType).toBe('t3.medium');
            expect(input.MinCount).toBe(1);
            expect(input.MaxCount).toBe(1);

            const tags = input.TagSpecifications?.[0].Tags;
            const userIdTag = tags?.find((t: any) => t.Key === 'userId');
            expect(userIdTag?.Value).toBe('test-user-123');
        });

        it('should use BasicDCV launch template', async () => {
            const mockConfig: EC2InstanceConfig = {
                userId: 'test-user',
                instanceType: 't3.micro',
            };

            mockEC2Success();

            const ec2Wrapper = new EC2Wrapper();
            await ec2Wrapper.createInstance(mockConfig);

            const calls = ec2Mock.commandCalls(RunInstancesCommand);
            const input = calls[0].args[0].input;
            expect(input.LaunchTemplate?.LaunchTemplateName).toBe('BasicDCV');
        });

        it('should throw error when instance limit exceeded', async () => {
            const mockConfig: EC2InstanceConfig = {
                userId: 'test-user',
                instanceType: 't3.micro',
            };

            ec2Mock.on(RunInstancesCommand).rejects({
                name: 'InstanceLimitExceeded',
                message: 'You have exceeded your instance limit',
                $metadata: { httpStatusCode: 400 }
            });

            const ec2Wrapper = new EC2Wrapper();

            await expect(ec2Wrapper.createInstance(mockConfig))
                .rejects
                .toThrow('Cannot create instance: Account instance limit exceeded');
        });

        it('should throw error when userId is empty', async () => {
            const mockConfig: EC2InstanceConfig = {
                userId: '',
                instanceType: 't3.micro',
            };

            const ec2Wrapper = new EC2Wrapper();

            await expect(ec2Wrapper.createInstance(mockConfig))
                .rejects
                .toThrow('userId is required and cannot be empty');
        });

        it('should throw error when subnet ID not found', async () => {
            const mockConfig: EC2InstanceConfig = {
                userId: 'test-user',
                instanceType: 't3.micro',
                subnetId: 'subnet-invalid',
            };

            ec2Mock.on(RunInstancesCommand).rejects({
                name: 'InvalidSubnetID.NotFound',
                message: 'Subnet not found',
                $metadata: { httpStatusCode: 400 }
            });

            const ec2Wrapper = new EC2Wrapper();

            await expect(ec2Wrapper.createInstance(mockConfig))
                .rejects
                .toThrow('Subnet ID subnet-invalid not found');
        });

        it('should throw error when security group not found', async () => {
            const mockConfig: EC2InstanceConfig = {
                userId: 'test-user',
                instanceType: 't3.micro',
                securityGroupIds: ['sg-invalid'],
            };

            ec2Mock.on(RunInstancesCommand).rejects({
                name: 'InvalidGroup.NotFound',
                message: 'Security group not found',
                $metadata: { httpStatusCode: 400 }
            });

            const ec2Wrapper = new EC2Wrapper();

            await expect(ec2Wrapper.createInstance(mockConfig))
                .rejects
                .toThrow('One or more security groups not found');
        });

        it('should throw error when key pair not found', async () => {
            const mockConfig: EC2InstanceConfig = {
                userId: 'test-user',
                instanceType: 't3.micro',
                keyName: 'invalid-keypair',
            };

            ec2Mock.on(RunInstancesCommand).rejects({
                name: 'InvalidKeyPair.NotFound',
                message: 'Key pair not found',
                $metadata: { httpStatusCode: 400 }
            });

            const ec2Wrapper = new EC2Wrapper();

            await expect(ec2Wrapper.createInstance(mockConfig))
                .rejects
                .toThrow("Key pair 'invalid-keypair' not found");
        });

        it('should create EC2 instance with existing AMI ID', async () => {
            const mockInstanceId = 'i-ami-test';
            const mockAmiId = 'ami-1234567890abcdef0';
            const mockConfig: EC2InstanceConfig = {
                userId: 'test-user-123',
                instanceType: 't3.medium',
                amiId: mockAmiId,
            };

            mockEC2Success(mockInstanceId);

            const ec2Wrapper = new EC2Wrapper('us-east-1');
            const result = await ec2Wrapper.createInstance(mockConfig);

            expect(result.instanceId).toBe(mockInstanceId);
            expect(result.state).toBe('pending');

            const calls = ec2Mock.commandCalls(RunInstancesCommand);
            expect(calls).toHaveLength(1);
            const input = calls[0].args[0].input;
            expect(input.ImageId).toBe(mockAmiId);
        });
    });

    describe('waitForInstanceRunning', () => {
        it('should wait for instance and return running state', async () => {
            mockWaiterSuccess();
            mockDescribeInstancesSuccess('i-wait-test');

            const ec2Wrapper = new EC2Wrapper();
            const result = await ec2Wrapper.waitForInstanceRunning('i-wait-test');

            expect(result.state).toBe('running');
            expect(result.instanceId).toBe('i-wait-test');
            expect(waitUntilInstanceRunning).toHaveBeenCalledTimes(1);
        });

        it('should throw error when waiter times out', async () => {
            (waitUntilInstanceRunning as jest.Mock).mockRejectedValue({
                name: 'WaiterTimedOut',
                message: 'Timeout waiting for instance'
            });

            const ec2Wrapper = new EC2Wrapper();

            await expect(ec2Wrapper.waitForInstanceRunning('i-timeout-test'))
                .rejects
                .toThrow('Timeout waiting for instance i-timeout-test to reach running state');
        });

        it('should throw generic error when wait fails', async () => {
            (waitUntilInstanceRunning as jest.Mock).mockRejectedValue({
                name: 'UnknownError',
                message: 'Unknown error'
            });

            const ec2Wrapper = new EC2Wrapper();

            await expect(ec2Wrapper.waitForInstanceRunning('i-error-test'))
                .rejects
                .toThrow('Error waiting for instance i-error-test');
        });
    });

    describe('createAndWaitForInstance', () => {
        it('should create and wait for instance successfully', async () => {
            const mockConfig: EC2InstanceConfig = {
                userId: 'test-user',
                instanceType: 't3.micro',
            };

            mockEC2Success('i-create-wait');
            mockWaiterSuccess();
            mockDescribeInstancesSuccess('i-create-wait');

            const ec2Wrapper = new EC2Wrapper();
            const result = await ec2Wrapper.createAndWaitForInstance(mockConfig);

            expect(result.state).toBe('running');
            expect(result.instanceId).toBe('i-create-wait');
            expect(waitUntilInstanceRunning).toHaveBeenCalledTimes(1);
        });

        it('should create instance without waiting when waitForRunning is false', async () => {
            const mockConfig: EC2InstanceConfig = {
                userId: 'test-user',
                instanceType: 't3.micro',
            };

            mockEC2Success('i-no-wait');

            const ec2Wrapper = new EC2Wrapper();
            const result = await ec2Wrapper.createAndWaitForInstance(mockConfig, false);

            expect(result.instanceId).toBe('i-no-wait');
            expect(result.state).toBe('pending');
            expect(waitUntilInstanceRunning).not.toHaveBeenCalled();
        });

        it('should wrap error with additional context when creation fails', async () => {
            const mockConfig: EC2InstanceConfig = {
                userId: 'test-user',
                instanceType: 't3.micro',
            };

            ec2Mock.on(RunInstancesCommand).rejects(new Error('Network error'));

            const ec2Wrapper = new EC2Wrapper();

            await expect(ec2Wrapper.createAndWaitForInstance(mockConfig))
                .rejects
                .toThrow('Failed to create and wait for instance');
        });
    });

    describe('snapshotAMIImage', () => {
        it('should successfully create AMI snapshot with userId', async () => {
            const mockInstanceId = 'i-snapshot-test';
            const mockUserId = 'test-user-123';
            const mockImageId = 'ami-snapshot123';

            ec2Mock.on(CreateImageCommand).resolves({
                ImageId: mockImageId
            });

            const ec2Wrapper = new EC2Wrapper();
            const result = await ec2Wrapper.snapshotAMIImage(mockInstanceId, mockUserId);

            expect(result).toBe(mockImageId);

            const calls = ec2Mock.commandCalls(CreateImageCommand);
            expect(calls).toHaveLength(1);
            const input = calls[0].args[0].input;

            expect(input.InstanceId).toBe(mockInstanceId);
            expect(input.Name).toContain('Lunaris-DCV');
            expect(input.Name).toContain(mockUserId);
            expect(input.NoReboot).toBe(true);
            expect(input.Description).toContain(mockUserId);

            // Check image tags
            const imageTags = input.TagSpecifications?.[0].Tags;
            expect(imageTags?.find((t: any) => t.Key === 'CreatedBy')?.Value).toBe('Lunaris');
            expect(imageTags?.find((t: any) => t.Key === 'HasDCV')?.Value).toBe('true');
            expect(imageTags?.find((t: any) => t.Key === 'UserId')?.Value).toBe(mockUserId);
            expect(imageTags?.find((t: any) => t.Key === 'SourceInstance')?.Value).toBe(mockInstanceId);

            // Check snapshot tags
            const snapshotTags = input.TagSpecifications?.[1].Tags;
            expect(snapshotTags?.find((t: any) => t.Key === 'CreatedBy')?.Value).toBe('Lunaris');
        });

        it('should throw error when ImageId is undefined', async () => {
            const mockInstanceId = 'i-snapshot-fail';
            const mockUserId = 'test-user';

            ec2Mock.on(CreateImageCommand).resolves({
                ImageId: undefined
            });

            const ec2Wrapper = new EC2Wrapper();

            await expect(ec2Wrapper.snapshotAMIImage(mockInstanceId, mockUserId))
                .rejects
                .toThrow(`AMI ID is undefined for this instance ${mockInstanceId}`);
        });

        it('should throw error when snapshot creation fails', async () => {
            const mockInstanceId = 'i-snapshot-error';
            const mockUserId = 'test-user';

            ec2Mock.on(CreateImageCommand).rejects({
                name: 'InvalidInstanceID.NotFound',
                message: 'Instance not found',
                $metadata: { httpStatusCode: 400 }
            });

            const ec2Wrapper = new EC2Wrapper();

            await expect(ec2Wrapper.snapshotAMIImage(mockInstanceId, mockUserId))
                .rejects
                .toThrow();
        });
    });

    describe('getInstance', () => {
        it('should successfully retrieve instance details', async () => {
            const mockInstanceId = 'i-get-test';
            const mockInstance = createMockInstance({ InstanceId: mockInstanceId });

            ec2Mock.on(DescribeInstancesCommand).resolves({
                Reservations: [{
                    Instances: [mockInstance]
                }]
            });

            const ec2Wrapper = new EC2Wrapper();
            const result = await ec2Wrapper.getInstance(mockInstanceId);

            expect(result.InstanceId).toBe(mockInstanceId);
            expect(result.State?.Name).toBe('pending');

            const calls = ec2Mock.commandCalls(DescribeInstancesCommand);
            expect(calls).toHaveLength(1);
            expect(calls[0].args[0].input.InstanceIds).toContain(mockInstanceId);
        });

        it('should throw error when getInstance fails', async () => {
            const mockInstanceId = 'i-not-found';

            ec2Mock.on(DescribeInstancesCommand).rejects({
                name: 'InvalidInstanceID.NotFound',
                message: 'Instance not found',
                $metadata: { httpStatusCode: 400 }
            });

            const ec2Wrapper = new EC2Wrapper();

            await expect(ec2Wrapper.getInstance(mockInstanceId))
                .rejects
                .toThrow();
        });
    });

    describe('modifyInstanceTag', () => {
        it('should successfully modify instance tag', async () => {
            const mockInstanceId = 'i-tag-test';
            const mockKey = 'dcvConfigured';
            const mockValue = 'true';

            ec2Mock.on(CreateTagsCommand).resolves({});

            const ec2Wrapper = new EC2Wrapper();
            await ec2Wrapper.modifyInstanceTag(mockInstanceId, mockKey, mockValue);

            const calls = ec2Mock.commandCalls(CreateTagsCommand);
            expect(calls).toHaveLength(1);
            const input = calls[0].args[0].input;

            expect(input.Resources).toContain(mockInstanceId);
            expect(input.Tags).toHaveLength(1);
            expect(input.Tags?.[0].Key).toBe(mockKey);
            expect(input.Tags?.[0].Value).toBe(mockValue);
        });

        it('should throw error when modifyInstanceTag fails', async () => {
            const mockInstanceId = 'i-tag-error';
            const mockKey = 'test-key';
            const mockValue = 'test-value';

            ec2Mock.on(CreateTagsCommand).rejects({
                name: 'InvalidInstanceID.NotFound',
                message: 'Instance not found',
                $metadata: { httpStatusCode: 400 }
            });

            const ec2Wrapper = new EC2Wrapper();

            await expect(ec2Wrapper.modifyInstanceTag(mockInstanceId, mockKey, mockValue))
                .rejects
                .toThrow();
        });
    });
});
