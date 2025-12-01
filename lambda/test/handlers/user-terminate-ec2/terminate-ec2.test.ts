import { TerminateEc2Event, handler } from "../../../src/handlers/user-terminate-ec2/terminate-ec2";
import EC2Wrapper, { TerminateResult } from "../../../src/utils/ec2Wrapper";
import EBSWrapper from "../../../src/utils/ebsWrapper";
import DCVWrapper, { StopDCVSessionResult } from "../../../src/utils/dcvWrapper";
import DynamoDBWrapper from "../../../src/utils/dynamoDbWrapper";

jest.mock("../../../src/utils/ec2Wrapper");
jest.mock("../../../src/utils/ebsWrapper");
jest.mock("../../../src/utils/dcvWrapper");
jest.mock("../../../src/utils/dynamoDbWrapper");

describe("terminate-ec2 Lambda handler", () => {
    let mockEC2Wrapper: jest.Mocked<EC2Wrapper>;
    let mockEBSWrapper: jest.Mocked<EBSWrapper>;
    let mockDCVWrapper: jest.Mocked<DCVWrapper>;
    let mockDynamoDBWrapper: jest.Mocked<DynamoDBWrapper>;

    const instanceId = "i-1234567890abcdef0";
    const userId = "test-user-123";
    const instanceArn = `arn:aws:ec2:us-east-1:123456789012:instance/${instanceId}`;
    const sessionId = "session-id-123";

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock implementations
        mockDynamoDBWrapper = new DynamoDBWrapper(
            "RunningInstances",
        ) as jest.Mocked<DynamoDBWrapper>;
        mockEC2Wrapper = new EC2Wrapper() as jest.Mocked<EC2Wrapper>;
        mockEBSWrapper = new EBSWrapper() as jest.Mocked<EBSWrapper>;
        mockDCVWrapper = new DCVWrapper(instanceId, userId) as jest.Mocked<DCVWrapper>;

        (EC2Wrapper as jest.MockedClass<typeof EC2Wrapper>).mockImplementation(
            () => mockEC2Wrapper,
        );
        (EBSWrapper as jest.MockedClass<typeof EBSWrapper>).mockImplementation(
            () => mockEBSWrapper,
        );
        (DCVWrapper as jest.MockedClass<typeof DCVWrapper>).mockImplementation(
            () => mockDCVWrapper,
        );
        (DynamoDBWrapper as jest.MockedClass<typeof DynamoDBWrapper>).mockImplementation(
            () => mockDynamoDBWrapper,
        );
    });

    describe("successful termination", () => {
       it("should terminate EC2 instance and detach volumes successfully", async () => {
        const mockInstance = { instanceId, status: "running", userId, creationTime: "2025-01-01T00:00:00Z" };
        mockDynamoDBWrapper.queryByUserId.mockResolvedValue([mockInstance]);

        mockDCVWrapper.stopDCVSession.mockResolvedValue({ stoppedSuccessfully: true, message: "DCV session stopped successfully" });
        mockEBSWrapper.detachEBSVolume.mockResolvedValue({ volumeId: "vol-12345", instanceId, state: "detached" });
        mockEC2Wrapper.getInstanceDetails.mockResolvedValue({ volumes: [{ volumeId: "vol-12345" }] });
        mockEC2Wrapper.terminateAndWait.mockResolvedValue({ instanceId, state: "terminated" });
        mockDynamoDBWrapper.updateItem.mockResolvedValue(undefined);

        const event = { userId };
        const result = await handler(event);

        expect(result.success).toBe(true);
        expect(result.detachVolumeState).toBe("detached");
        expect(result.dcvStopped).toBe(true);
        expect(result.terminateInstanceState).toBe("terminated");
        expect(result.dynamoDbUpdateStatus).toBe("updated");
        expect(result.message).toBe(`Instance ${instanceId} terminated successfully.`);
    });
    });

    describe("error handling", () => {
       it("should return an error when the instance is not found in DynamoDB", async () => {
        mockDynamoDBWrapper.queryByUserId.mockResolvedValue([]); // simulate no instance found

        const event = { userId, instanceArn };
        const result = await handler(event);

        expect(result.success).toBe(false);
        expect(result.error).toBe(`No running instances found for user ${userId}`);
    });

           it("should return an error when no running instances are found", async () => {
            mockDynamoDBWrapper.queryByUserId.mockResolvedValue([]); // No instances for user

            const event = { userId };
            const result = await handler(event);

            expect(result.success).toBe(false);
            expect(result.error).toBe(`No running instances found for user ${userId}`);
        });

        it("should handle already terminated instance", async () => {
        const mockInstance = { instanceId, status: "terminated", userId, creationTime: "2025-01-01T00:00:00Z" };
        mockDynamoDBWrapper.queryByUserId.mockResolvedValue([mockInstance]);

        const event = { userId };
        const result = await handler(event);

        expect(result.success).toBe(true);
        expect(result.message).toBe(`Instance ${instanceId} already terminated`);
    });

       it("should keep going if DCV session stop fails", async () => {
        const mockInstance = { instanceId, status: "running", userId, creationTime: "2025-01-01T00:00:00Z" };
        mockDynamoDBWrapper.queryByUserId.mockResolvedValue([mockInstance]); // updated

        mockEC2Wrapper.getInstanceDetails.mockResolvedValue({
            volumes: [{ volumeId: "vol-12345" }],
        });
        mockEBSWrapper.detachEBSVolume.mockResolvedValue({
            volumeId: "vol-12345",
            instanceId,
            state: "detached",
        });
        mockEC2Wrapper.terminateAndWait.mockResolvedValue({ instanceId, state: "terminated" });

        mockDCVWrapper.stopDCVSession.mockResolvedValue({
            stoppedSuccessfully: false,
            message: "DCV close-session failed: DCV stop failed",
        });

        const event = { userId, instanceArn };
        const result = await handler(event);

        expect(result.success).toBe(true);
        expect(result.dcvStopped).toBe(false);
        expect(result.message).toBe(
            `Instance ${instanceId} terminated successfully. DCV close-session failed: DCV stop failed`
        );
        expect(result.detachVolumeState).toBe("detached");
        expect(result.terminateInstanceState).toBe("terminated");
    });


 it("should return an error if volume detachment fails", async () => {
        const mockInstance = { instanceId, status: "running", userId, creationTime: "2025-01-01T00:00:00Z" };
        mockDynamoDBWrapper.queryByUserId.mockResolvedValue([mockInstance]); // updated

        mockEC2Wrapper.getInstanceDetails.mockResolvedValue({
            volumes: [{ volumeId: "vol-12345" }],
        });
        mockDCVWrapper.stopDCVSession.mockResolvedValue({
            stoppedSuccessfully: true,
            message: "DCV session stopped successfully",
        });
        mockEBSWrapper.detachEBSVolume.mockResolvedValue({
            volumeId: "vol-12345",
            instanceId,
            state: "detach-failed",
        });

        const event = { userId, instanceArn };
        const result = await handler(event);

        expect(result.success).toBe(false);
        expect(result.error).toBe(
            "Failed to detach volume vol-12345. Current state: detach-failed"
        );
    });

    it("should return an error if EC2 termination fails", async () => {
        mockEC2Wrapper.getInstanceDetails.mockResolvedValue({
            volumes: [{ volumeId: "vol-12345" }],
        });

        mockDCVWrapper.stopDCVSession.mockResolvedValue({
            stoppedSuccessfully: true,
            message: "DCV session stopped successfully",
        });
        mockEBSWrapper.detachEBSVolume.mockResolvedValue({
            volumeId: "vol-12345",
            instanceId: "i-1234567890abcdef0",
            state: "detached",
        });

        mockEC2Wrapper.terminateAndWait.mockRejectedValue(new Error("Termination failed"));

        const event = { userId, instanceArn };
        const result = await handler(event);

        expect(result.success).toBe(false);
        expect(result.error).toBe("Termination failed");
    });

    it("should return an error if no volumes are found for instance", async () => {
        mockEC2Wrapper.getInstanceDetails.mockResolvedValue({ volumes: [] }); // No volumes

        const event = { userId, instanceArn };
        const result = await handler(event);

        expect(result.success).toBe(false);
        expect(result.error).toBe("No volume found for instance");
    });

    it("should retunr an error if DynamoDB update failure", async () => {
        const mockInstance = { instanceId, status: "running", userId, creationTime: "2025-01-01T00:00:00Z" };
        mockDynamoDBWrapper.queryByUserId.mockResolvedValue([mockInstance]); // updated

        mockEC2Wrapper.getInstanceDetails.mockResolvedValue({
            volumes: [{ volumeId: "vol-12345" }],
        });
        mockDCVWrapper.stopDCVSession.mockResolvedValue({
            stoppedSuccessfully: true,
            message: "DCV session stopped successfully",
        });
        mockEBSWrapper.detachEBSVolume.mockResolvedValue({
            volumeId: "vol-12345",
            instanceId,
            state: "detached",
        });
        mockEC2Wrapper.terminateAndWait.mockResolvedValue({ instanceId, state: "terminated" });
        mockDynamoDBWrapper.updateItem.mockRejectedValue(new Error("DynamoDB update failed"));

        const event = { userId, instanceArn };
        const result = await handler(event);

        expect(result.success).toBe(false);
        expect(result.error).toBe(
            `Failed to update DynamoDB for instance ${instanceId}: DynamoDB update failed`
        );
    });

     it("should return an error if DynamoDB getItem fails", async () => {
        mockDynamoDBWrapper.queryByUserId.mockRejectedValue(new Error("DynamoDB fetch failed"));

        const event = { userId, instanceArn };
        const result = await handler(event);

        expect(result.success).toBe(false);
        expect(result.error).toBe("DynamoDB fetch failed");
    });

    it("should return error if queryByUserId returns no instance for the given user", async () => {
        mockDynamoDBWrapper.queryByUserId.mockResolvedValue([]);

        const event = { userId, instanceArn: "arn:aws:ec2:us-east-1:123456789012:instance/" }; 
        const result = await handler(event);

        expect(result.success).toBe(false);
        expect(result.error).toBe(`No running instances found for user ${userId}`);
    });


    });
});
