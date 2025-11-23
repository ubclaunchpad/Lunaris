import { IAM } from '@aws-sdk/client-iam';
import { handler } from '../../../src/handlers/user-deploy-ec2/deploy-ec2';
import DCVWrapper from '../../../src/utils/dcvWrapper';
import EC2Wrapper from '../../../src/utils/ec2Wrapper';
import IAMWrapper from '../../../src/utils/iamWrapper';
import SSMWrapper from '../../../src/utils/ssmWrapper';
import EBSWrapper from '../../../src/utils/ebsWrapper';
import DynamoDBWrapper from '../../../src/utils/dynamoDbWrapper';
import { EC2, type Instance } from "@aws-sdk/client-ec2";
import { error } from 'console';
import { EBSStatusEnum } from '../../../src/utils/ebsWrapper';

jest.mock('../../../src/utils/ec2Wrapper');
jest.mock('../../../src/utils/dcvWrapper');
jest.mock('../../../src/utils/ssmWrapper');
jest.mock('../../../src/utils/iamWrapper');
jest.mock('../../../src/utils/ebsWrapper');
jest.mock('../../../src/utils/dynamoDbWrapper');
describe('deploy-ec2 Step Function handler', () => {
    let mockDCVWrapper: jest.Mocked<DCVWrapper>
    let mockSSMWrapper: jest.Mocked<SSMWrapper>
    let mockIAMWrapper: jest.Mocked<IAMWrapper>
    let mockEC2Wrapper: jest.Mocked<EC2Wrapper>
    let mockEBSWrapper: jest.Mocked<EBSWrapper>
    let mockDynamoDBWrapper: jest.Mocked<DynamoDBWrapper>


    const originalEnv = process.env;
    const mockInstanceId = 'i-1234567890abcdef0';
    const mockUserId = 'test-user-123';
    const mockPublicIp = '54.123.45.67';
    const mockVolumeId = 'vol-1234567890abcdef0';
    const mockSessionName = `user-${mockUserId}-session`;

    beforeEach(() => {
        jest.clearAllMocks();

        mockDCVWrapper = new DCVWrapper(mockInstanceId, mockUserId) as jest.Mocked<DCVWrapper>;
        mockSSMWrapper = new SSMWrapper() as jest.Mocked<SSMWrapper>;
        mockIAMWrapper = new IAMWrapper() as jest.Mocked<IAMWrapper>;
        mockEC2Wrapper = new EC2Wrapper() as jest.Mocked<EC2Wrapper>;
        mockEBSWrapper = new EBSWrapper() as jest.Mocked<EBSWrapper>;
        mockDynamoDBWrapper = new DynamoDBWrapper('RunningStreams') as jest.Mocked<DynamoDBWrapper>;

        (DCVWrapper as jest.MockedClass<typeof DCVWrapper>).mockImplementation(() => mockDCVWrapper);
        (SSMWrapper as jest.MockedClass<typeof SSMWrapper>).mockImplementation(() => mockSSMWrapper);
        (IAMWrapper as jest.MockedClass<typeof IAMWrapper>).mockImplementation(() => mockIAMWrapper);
        (EC2Wrapper as jest.MockedClass<typeof EC2Wrapper>).mockImplementation(() => mockEC2Wrapper);
        (EBSWrapper as jest.MockedClass<typeof EBSWrapper>).mockImplementation(() => mockEBSWrapper);
        (DynamoDBWrapper as jest.MockedClass<typeof DynamoDBWrapper>).mockImplementation(() => mockDynamoDBWrapper);

        mockDynamoDBWrapper.getTableName = jest.fn().mockReturnValue('RunningStreams');
        mockDynamoDBWrapper.putItem = jest.fn().mockResolvedValue(undefined);

        process.env.SECURITY_GROUP_ID = 'sg-test123';
        process.env.SUBNET_ID = 'subnet-test456';
        process.env.KEY_PAIR_NAME = 'test-keypair';
        process.env.RUNNING_INSTANCES_TABLE = 'RunningStreams';
    });

    afterEach(() => {
        process.env = originalEnv;
    });


    const mockEC2WrapperFailure = (errorMessage: string) => {
        (EC2Wrapper as jest.MockedClass<typeof EC2Wrapper>).mockImplementation(() => ({
            createAndWaitForInstance: jest.fn().mockRejectedValue(new Error(errorMessage)),
            createInstance: jest.fn(),
            waitForInstanceRunning: jest.fn(),
        } as any));
    };

    describe('successful deployment', () => {
        it('should create EC2 instance, attach EBS, install DCV, save to DB, and return success', async () => {
            mockSSMWrapper.getParamFromParamStore.mockResolvedValue("");

            const iamProfileArn = 'arn:aws:iam::123456789012:instance-profile/Lunaris-EC2-SSM-Profile';
            mockIAMWrapper.getProfile.mockResolvedValue(iamProfileArn);

            const mockInstance = {
                instanceId: mockInstanceId,
                instanceArn: `arn:aws:ec2:us-east-1:123456789012:instance/${mockInstanceId}`,
                state: 'running',
                publicIp: mockPublicIp,
                privateIp: '10.0.1.100',
                createdAt: new Date().toISOString()
            };
            mockEC2Wrapper.createAndWaitForInstance.mockResolvedValue(mockInstance);
            mockEC2Wrapper.snapshotAMIImage.mockResolvedValue('ami-new123');

            mockEBSWrapper.attachOrReuseVolume.mockResolvedValue({
                volumeId: mockVolumeId,
                status: EBSStatusEnum.IN_USE
            });

            const url = `https://${mockPublicIp}:8443?session-id=${encodeURIComponent(mockSessionName)}`;
            mockDCVWrapper.getDCVSession.mockResolvedValue(url);

            const event = {
                userId: 'test-user-123',
                instanceType: 't3.medium' as const,
            };

            const result = await handler(event);

            expect(result.success).toBe(true);

            if (!result.success) throw error;

            expect(result.instanceId).toBe(mockInstance.instanceId);
            expect(result.instanceArn).toBe(mockInstance.instanceArn);
            expect(result.state).toBe('running');
            expect(result.publicIp).toBe(mockInstance.publicIp);
            expect(result.privateIp).toBe(mockInstance.privateIp);
            expect(result.createdAt).toBeDefined();
            expect(result.streamingUrl).toBe(url);

            expect(mockSSMWrapper.getParamFromParamStore).toHaveBeenCalledWith('ami_id');
            expect(mockIAMWrapper.getProfile).toHaveBeenCalledTimes(1);
            expect(mockEC2Wrapper.createAndWaitForInstance).toHaveBeenCalledTimes(1);
            expect(mockEBSWrapper.attachOrReuseVolume).toHaveBeenCalledWith(
                { userId: 'test-user-123' },
                mockInstanceId
            );
            expect(mockDCVWrapper.getDCVSession).toHaveBeenCalledTimes(1);
            expect(mockDynamoDBWrapper.putItem).toHaveBeenCalledTimes(1);

            expect(mockEC2Wrapper.snapshotAMIImage).toHaveBeenCalledWith(mockInstanceId, 'test-user-123');
            expect(mockSSMWrapper.putParamInParamStore).toHaveBeenCalledWith('ami_id', 'ami-new123');

            const calledConfig = mockEC2Wrapper.createAndWaitForInstance.mock.calls[0][0];
            expect(calledConfig.userId).toBe('test-user-123');
            expect(calledConfig.instanceType).toBe('t3.medium');
            expect(calledConfig.securityGroupIds).toEqual(['sg-test123']);
            expect(calledConfig.subnetId).toBe('subnet-test456');
            expect(calledConfig.keyName).toBe('test-keypair');
            expect(calledConfig.iamInstanceProfile).toBe(iamProfileArn);
            expect(calledConfig.amiId).toBe('');
        });

        it('should skip AMI snapshot when AMI already exists in parameter store', async () => {
            const amiId = "ami-1234567890abcdef0"
            mockSSMWrapper.getParamFromParamStore.mockResolvedValue(amiId);

            const iamProfileArn = 'arn:aws:iam::123456789012:instance-profile/Lunaris-EC2-SSM-Profile';
            mockIAMWrapper.getProfile.mockResolvedValue(iamProfileArn);

            const mockInstance = {
                instanceId: mockInstanceId,
                instanceArn: `arn:aws:ec2:us-east-1:123456789012:instance/${mockInstanceId}`,
                state: 'running',
                publicIp: mockPublicIp,
                privateIp: '10.0.1.100',
                createdAt: new Date().toISOString()
            };
            mockEC2Wrapper.createAndWaitForInstance.mockResolvedValue(mockInstance);

            mockEBSWrapper.attachOrReuseVolume.mockResolvedValue({
                volumeId: mockVolumeId,
                status: EBSStatusEnum.IN_USE
            });

            const url = `https://${mockPublicIp}:8443?session-id=${encodeURIComponent(mockSessionName)}`;
            mockDCVWrapper.getDCVSession.mockResolvedValue(url);

            const event = {
                userId: 'test-user-123',
                instanceType: 't3.medium' as const,
            };

            const result = await handler(event);

            expect(result.success).toBe(true);

            if (!result.success) throw error;

            expect(result.instanceId).toBe(mockInstance.instanceId);
            expect(result.instanceArn).toBe(mockInstance.instanceArn);
            expect(result.state).toBe('running');
            expect(result.publicIp).toBe(mockInstance.publicIp);
            expect(result.privateIp).toBe(mockInstance.privateIp);
            expect(result.createdAt).toBeDefined();
            expect(result.streamingUrl).toBe(url);

            expect(mockSSMWrapper.getParamFromParamStore).toHaveBeenCalledWith('ami_id');
            expect(mockIAMWrapper.getProfile).toHaveBeenCalledTimes(1);
            expect(mockEC2Wrapper.createAndWaitForInstance).toHaveBeenCalledTimes(1);
            expect(mockEBSWrapper.attachOrReuseVolume).toHaveBeenCalledTimes(1);
            expect(mockDCVWrapper.getDCVSession).toHaveBeenCalledTimes(1);
            expect(mockDynamoDBWrapper.putItem).toHaveBeenCalledTimes(1);

            expect(mockEC2Wrapper.snapshotAMIImage).not.toHaveBeenCalled()
            expect(mockSSMWrapper.putParamInParamStore).not.toHaveBeenCalled()

            const calledConfig = mockEC2Wrapper.createAndWaitForInstance.mock.calls[0][0];
            expect(calledConfig.userId).toBe('test-user-123');
            expect(calledConfig.instanceType).toBe('t3.medium');
            expect(calledConfig.securityGroupIds).toEqual(['sg-test123']);
            expect(calledConfig.subnetId).toBe('subnet-test456');
            expect(calledConfig.keyName).toBe('test-keypair');
            expect(calledConfig.iamInstanceProfile).toBe(iamProfileArn);
            expect(calledConfig.amiId).toBe(amiId);
        });

        it('should handle missing environment variables gracefully', async () => {
            delete process.env.SECURITY_GROUP_ID;
            delete process.env.SUBNET_ID;
            delete process.env.KEY_PAIR_NAME;

            const amiId = "ami-1234567890abcdef0"
            mockSSMWrapper.getParamFromParamStore.mockResolvedValue(amiId);

            const iamProfileArn = 'arn:aws:iam::123456789012:instance-profile/Lunaris-EC2-SSM-Profile';
            mockIAMWrapper.getProfile.mockResolvedValue(iamProfileArn);

            const mockInstance = {
                instanceId: mockInstanceId,
                instanceArn: `arn:aws:ec2:us-east-1:123456789012:instance/${mockInstanceId}`,
                state: 'running',
                publicIp: mockPublicIp,
                privateIp: '10.0.1.100',
                createdAt: new Date().toISOString()
            };
            mockEC2Wrapper.createAndWaitForInstance.mockResolvedValue(mockInstance);

            mockEBSWrapper.attachOrReuseVolume.mockResolvedValue({
                volumeId: mockVolumeId,
                status: EBSStatusEnum.IN_USE
            });

            const url = `https://${mockPublicIp}:8443?session-id=${encodeURIComponent(mockSessionName)}`;
            mockDCVWrapper.getDCVSession.mockResolvedValue(url);

            const event = {
                userId: 'test-user-123',
                instanceType: 't3.micro' as const,
            };

            const result = await handler(event);

            expect(result.success).toBe(true);

            const mockWrapper = (EC2Wrapper as jest.MockedClass<typeof EC2Wrapper>).mock.results[0].value;
            const calledConfig = (mockWrapper.createAndWaitForInstance as jest.Mock).mock.calls[0][0];

            expect(calledConfig.securityGroupIds).toBeUndefined();
            expect(calledConfig.subnetId).toBeUndefined();
            expect(calledConfig.keyName).toBeUndefined();
        });
    });

    describe('error handling', () => {
        it('should return error response when IAM profile retrieval fails', async () => {

            mockSSMWrapper.getParamFromParamStore.mockResolvedValue('');
            mockIAMWrapper.getProfile.mockRejectedValue(new Error('IAM profile not found'));

            const event = {
                userId: 'test-user-123',
                instanceType: 't3.micro' as const,
            };


            const result = await handler(event);


            expect(result.success).toBe(false);

            // Should not proceed to EC2 creation
            expect(mockEC2Wrapper.createAndWaitForInstance).not.toHaveBeenCalled();
            expect(mockDCVWrapper.getDCVSession).not.toHaveBeenCalled();
        });

        it('should return error response when DCV session creation fails', async () => {

            mockSSMWrapper.getParamFromParamStore.mockResolvedValue('ami-existing123');

            const iamProfileArn = 'arn:aws:iam::123456789012:instance-profile/Lunaris-EC2-SSM-Profile';
            mockIAMWrapper.getProfile.mockResolvedValue(iamProfileArn);

            const mockInstance = {
                instanceId: mockInstanceId,
                instanceArn: `arn:aws:ec2:us-east-1:123456789012:instance/${mockInstanceId}`,
                state: 'running',
                publicIp: mockPublicIp,
                privateIp: '10.0.1.100',
                createdAt: new Date().toISOString()
            };
            mockEC2Wrapper.createAndWaitForInstance.mockResolvedValue(mockInstance);

            // DCV session creation fails
            mockDCVWrapper.getDCVSession.mockRejectedValue(new Error('DCV installation failed'));

            const event = {
                userId: 'test-user-123',
                instanceType: 'g4dn.xlarge' as const,
            };


            const result = await handler(event);


            expect(result.success).toBe(false);

            // Should have created instance but failed on DCV
            expect(mockEC2Wrapper.createAndWaitForInstance).toHaveBeenCalledTimes(1);
            expect(mockDCVWrapper.getDCVSession).toHaveBeenCalledTimes(1);
        });

        it('should return error response when SSM parameter retrieval fails', async () => {

            mockSSMWrapper.getParamFromParamStore.mockRejectedValue(new Error('Parameter store access denied'));

            const event = {
                userId: 'test-user-123',
                instanceType: 't3.micro' as const,
            };


            const result = await handler(event);


            expect(result.success).toBe(false);

            // Should fail before IAM/EC2 calls
            expect(mockIAMWrapper.getProfile).not.toHaveBeenCalled();
            expect(mockEC2Wrapper.createAndWaitForInstance).not.toHaveBeenCalled();
        });

        it('should return error response when AMI snapshot creation fails', async () => {

            mockSSMWrapper.getParamFromParamStore.mockResolvedValue(''); // No existing AMI

            const iamProfileArn = 'arn:aws:iam::123456789012:instance-profile/Lunaris-EC2-SSM-Profile';
            mockIAMWrapper.getProfile.mockResolvedValue(iamProfileArn);

            const mockInstance = {
                instanceId: mockInstanceId,
                instanceArn: `arn:aws:ec2:us-east-1:123456789012:instance/${mockInstanceId}`,
                state: 'running',
                publicIp: mockPublicIp,
                privateIp: '10.0.1.100',
                createdAt: new Date().toISOString()
            };
            mockEC2Wrapper.createAndWaitForInstance.mockResolvedValue(mockInstance);

            const url = `https://${mockPublicIp}:8443?session-id=${encodeURIComponent(mockSessionName)}`;
            mockDCVWrapper.getDCVSession.mockResolvedValue(url);

            // Snapshot fails
            mockEC2Wrapper.snapshotAMIImage.mockRejectedValue(new Error('Insufficient storage for snapshot'));

            const event = {
                userId: 'test-user-123',
                instanceType: 't3.micro' as const,
            };


            const result = await handler(event);


            expect(result.success).toBe(false);

            // Should have gotten to snapshot phase
            expect(mockEC2Wrapper.createAndWaitForInstance).toHaveBeenCalledTimes(1);
            expect(mockDCVWrapper.getDCVSession).toHaveBeenCalledTimes(1);
            expect(mockEC2Wrapper.snapshotAMIImage).toHaveBeenCalledTimes(1);
            expect(mockSSMWrapper.putParamInParamStore).not.toHaveBeenCalled();
        });

        it('should return error response when saving AMI to parameter store fails', async () => {

            mockSSMWrapper.getParamFromParamStore.mockResolvedValue(''); // No existing AMI

            const iamProfileArn = 'arn:aws:iam::123456789012:instance-profile/Lunaris-EC2-SSM-Profile';
            mockIAMWrapper.getProfile.mockResolvedValue(iamProfileArn);

            const mockInstance = {
                instanceId: mockInstanceId,
                instanceArn: `arn:aws:ec2:us-east-1:123456789012:instance/${mockInstanceId}`,
                state: 'running',
                publicIp: mockPublicIp,
                privateIp: '10.0.1.100',
                createdAt: new Date().toISOString()
            };
            mockEC2Wrapper.createAndWaitForInstance.mockResolvedValue(mockInstance);

            const url = `https://${mockPublicIp}:8443?session-id=${encodeURIComponent(mockSessionName)}`;
            mockDCVWrapper.getDCVSession.mockResolvedValue(url);

            mockEC2Wrapper.snapshotAMIImage.mockResolvedValue('ami-new123');

            // Saving to parameter store fails
            mockSSMWrapper.putParamInParamStore.mockRejectedValue(new Error('Parameter store write denied'));

            const event = {
                userId: 'test-user-123',
                instanceType: 't3.micro' as const,
            };


            const result = await handler(event);


            expect(result.success).toBe(false);

            // Should have gotten through snapshot but failed on save
            expect(mockEC2Wrapper.snapshotAMIImage).toHaveBeenCalledTimes(1);
            expect(mockSSMWrapper.putParamInParamStore).toHaveBeenCalledWith('ami_id', 'ami-new123');
        });

        it('should return error response when instance creation fails', async () => {
            mockEC2WrapperFailure('Instance limit exceeded');

            const event = {
                userId: 'test-user-123',
                instanceType: 't3.micro' as const,
            };

            const result = await handler(event);

            expect(result.success).toBe(false);
        });

        it('should handle error without message gracefully', async () => {
            mockSSMWrapper.getParamFromParamStore.mockRejectedValue(new Error());

            const event = {
                userId: 'test-user-123',
                instanceType: 't3.micro' as const,
            };

            const result = await handler(event);

            expect(result.success).toBe(false);
        });

        it('should return error response when EBS volume attachment fails', async () => {
            mockSSMWrapper.getParamFromParamStore.mockResolvedValue('ami-existing123');

            const iamProfileArn = 'arn:aws:iam::123456789012:instance-profile/Lunaris-EC2-SSM-Profile';
            mockIAMWrapper.getProfile.mockResolvedValue(iamProfileArn);

            const mockInstance = {
                instanceId: mockInstanceId,
                instanceArn: `arn:aws:ec2:us-east-1:123456789012:instance/${mockInstanceId}`,
                state: 'running',
                publicIp: mockPublicIp,
                privateIp: '10.0.1.100',
                createdAt: new Date().toISOString()
            };
            mockEC2Wrapper.createAndWaitForInstance.mockResolvedValue(mockInstance);

            mockEBSWrapper.attachOrReuseVolume.mockRejectedValue(new Error('Volume attachment failed'));

            const event = {
                userId: 'test-user-123',
                instanceType: 't3.medium' as const,
            };

            const result = await handler(event);

            expect(result.success).toBe(false);
            expect(mockEC2Wrapper.createAndWaitForInstance).toHaveBeenCalledTimes(1);
            expect(mockEBSWrapper.attachOrReuseVolume).toHaveBeenCalledTimes(1);
            expect(mockDCVWrapper.getDCVSession).not.toHaveBeenCalled();
        });

        it('should return error response when DynamoDB save fails', async () => {
            mockSSMWrapper.getParamFromParamStore.mockResolvedValue('ami-existing123');

            const iamProfileArn = 'arn:aws:iam::123456789012:instance-profile/Lunaris-EC2-SSM-Profile';
            mockIAMWrapper.getProfile.mockResolvedValue(iamProfileArn);

            const mockInstance = {
                instanceId: mockInstanceId,
                instanceArn: `arn:aws:ec2:us-east-1:123456789012:instance/${mockInstanceId}`,
                state: 'running',
                publicIp: mockPublicIp,
                privateIp: '10.0.1.100',
                createdAt: new Date().toISOString()
            };
            mockEC2Wrapper.createAndWaitForInstance.mockResolvedValue(mockInstance);

            mockEBSWrapper.attachOrReuseVolume.mockResolvedValue({
                volumeId: mockVolumeId,
                status: EBSStatusEnum.IN_USE
            });

            const url = `https://${mockPublicIp}:8443?session-id=${encodeURIComponent(mockSessionName)}`;
            mockDCVWrapper.getDCVSession.mockResolvedValue(url);

            mockDynamoDBWrapper.putItem.mockRejectedValue(new Error('DynamoDB write failed'));

            const event = {
                userId: 'test-user-123',
                instanceType: 't3.medium' as const,
            };

            const result = await handler(event);

            expect(result.success).toBe(false);
            expect(mockEC2Wrapper.createAndWaitForInstance).toHaveBeenCalledTimes(1);
            expect(mockEBSWrapper.attachOrReuseVolume).toHaveBeenCalledTimes(1);
            expect(mockDCVWrapper.getDCVSession).toHaveBeenCalledTimes(1);
            expect(mockDynamoDBWrapper.putItem).toHaveBeenCalledTimes(1);
        });

        it('should handle error without message gracefully', async () => {

            mockSSMWrapper.getParamFromParamStore.mockRejectedValue(new Error());

            const event = {
                userId: 'test-user-123',
                instanceType: 't3.micro' as const,
            };


            const result = await handler(event);


            expect(result.success).toBe(false);
            expect(result.error).toBe('Unknown error during instance creation');
        });
    });
});
