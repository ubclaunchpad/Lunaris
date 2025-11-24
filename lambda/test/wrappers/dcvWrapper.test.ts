import DCVWrapper from "../../src/utils/dcvWrapper";
import EC2Wrapper from "../../src/utils/ec2Wrapper";
import SSMWrapper from "../../src/utils/ssmWrapper";
import { type Instance } from "@aws-sdk/client-ec2";

// Mock the wrapper dependencies
jest.mock("../../src/utils/ec2Wrapper");
jest.mock("../../src/utils/ssmWrapper");

describe("DCVWrapper", () => {
    let dcvWrapper: DCVWrapper;
    let mockEC2Wrapper: jest.Mocked<EC2Wrapper>;
    let mockSSMWrapper: jest.Mocked<SSMWrapper>;

    const mockInstanceId = "i-1234567890abcdef0";
    const mockUserId = "test-user-123";
    const mockCommandId = "cmd-1234567890abcdef0";
    const mockPublicIp = "54.123.45.67";
    const mockSessionName = `user-${mockUserId}-session`;

    beforeEach(() => {
        jest.clearAllMocks();

        // Create mock instances
        mockEC2Wrapper = new EC2Wrapper() as jest.Mocked<EC2Wrapper>;
        mockSSMWrapper = new SSMWrapper() as jest.Mocked<SSMWrapper>;

        // Setup constructor mocks
        (EC2Wrapper as jest.MockedClass<typeof EC2Wrapper>).mockImplementation(
            () => mockEC2Wrapper,
        );
        (SSMWrapper as jest.MockedClass<typeof SSMWrapper>).mockImplementation(
            () => mockSSMWrapper,
        );

        dcvWrapper = new DCVWrapper(mockInstanceId, mockUserId);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Helper to create mock EC2 Instance
    const createMockInstance = (overrides: Partial<Instance> = {}): Instance => ({
        InstanceId: mockInstanceId,
        InstanceType: "g4dn.xlarge",
        State: { Name: "running", Code: 16 },
        PublicIpAddress: mockPublicIp,
        PrivateIpAddress: "10.0.1.100",
        Tags: [],
        LaunchTime: new Date(),
        ...overrides,
    });

    describe("getDCVSession", () => {
        it("should return streaming URL when DCV is already configured", async () => {
            mockEC2Wrapper.getInstance.mockResolvedValue(
                createMockInstance({
                    Tags: [{ Key: "dcvConfigured", Value: "true" }],
                }),
            );
            mockSSMWrapper.runCreateSession.mockResolvedValue(mockCommandId);
            mockSSMWrapper.getCommandStatus.mockResolvedValue("Success");

            const url = await dcvWrapper.getDCVSession();

            expect(url).toBe(
                `https://${mockPublicIp}:8443?session-id=${encodeURIComponent(mockSessionName)}`,
            );
            expect(mockEC2Wrapper.getInstance).toHaveBeenCalledWith(mockInstanceId);
            expect(mockSSMWrapper.runInstall).not.toHaveBeenCalled(); // Should skip install
            expect(mockSSMWrapper.runCreateSession).toHaveBeenCalled();
        });

        it("should install DCV if not configured", async () => {
            mockEC2Wrapper.getInstance.mockResolvedValue(
                createMockInstance({
                    Tags: [{ Key: "dcvConfigured", Value: "false" }],
                }),
            );
            mockSSMWrapper.runInstall.mockResolvedValue(mockCommandId);
            mockSSMWrapper.runCreateSession.mockResolvedValue(mockCommandId);
            mockSSMWrapper.getCommandStatus.mockResolvedValue("Success");
            mockEC2Wrapper.modifyInstanceTag.mockResolvedValue();

            const url = await dcvWrapper.getDCVSession();

            expect(mockSSMWrapper.runInstall).toHaveBeenCalledWith({
                instanceId: mockInstanceId,
            });
            expect(mockEC2Wrapper.modifyInstanceTag).toHaveBeenCalledWith(
                mockInstanceId,
                "dcvConfigured",
                "true",
            );
            expect(url).toBe(
                `https://${mockPublicIp}:8443?session-id=${encodeURIComponent(mockSessionName)}`,
            );
        });

        it("should install DCV if tag is missing", async () => {
            mockEC2Wrapper.getInstance.mockResolvedValue(
                createMockInstance({ Tags: [] }), // No dcvConfigured tag
            );
            mockSSMWrapper.runInstall.mockResolvedValue(mockCommandId);
            mockSSMWrapper.runCreateSession.mockResolvedValue(mockCommandId);
            mockSSMWrapper.getCommandStatus.mockResolvedValue("Success");
            mockEC2Wrapper.modifyInstanceTag.mockResolvedValue();

            await dcvWrapper.getDCVSession();

            expect(mockSSMWrapper.runInstall).toHaveBeenCalled();
        });

        it("should throw error if EC2 getInstance fails", async () => {
            mockEC2Wrapper.getInstance.mockRejectedValue(new Error("Instance not found"));

            await expect(dcvWrapper.getDCVSession()).rejects.toThrow("Instance not found");
        });
    });

    describe("installDCV", () => {
        it("should successfully install DCV and tag instance", async () => {
            mockSSMWrapper.runInstall.mockResolvedValue(mockCommandId);
            mockSSMWrapper.getCommandStatus.mockResolvedValue("Success");
            mockEC2Wrapper.modifyInstanceTag.mockResolvedValue();

            await dcvWrapper.installDCV();

            expect(mockSSMWrapper.runInstall).toHaveBeenCalledWith({
                instanceId: mockInstanceId,
            });
            expect(mockSSMWrapper.getCommandStatus).toHaveBeenCalledWith(
                mockCommandId,
                mockInstanceId,
            );
            expect(mockEC2Wrapper.modifyInstanceTag).toHaveBeenCalledWith(
                mockInstanceId,
                "dcvConfigured",
                "true",
            );
        });

        it("should wait for installation to complete", async () => {
            mockSSMWrapper.runInstall.mockResolvedValue(mockCommandId);
            mockSSMWrapper.getCommandStatus
                .mockResolvedValueOnce("Pending")
                .mockResolvedValueOnce("InProgress")
                .mockResolvedValueOnce("Success");
            mockEC2Wrapper.modifyInstanceTag.mockResolvedValue();

            await dcvWrapper.installDCV();

            expect(mockSSMWrapper.getCommandStatus).toHaveBeenCalledTimes(3);
        }, 100000);

        it("should throw error if installation fails", async () => {
            mockSSMWrapper.runInstall.mockResolvedValue(mockCommandId);
            mockSSMWrapper.getCommandStatus.mockResolvedValue("Failed");

            await expect(dcvWrapper.installDCV()).rejects.toThrow(
                "SSM command failed with status: Failed",
            );
        }, 100000);

        it("should throw error if installation times out", async () => {
            mockSSMWrapper.runInstall.mockResolvedValue(mockCommandId);
            mockSSMWrapper.getCommandStatus.mockResolvedValue("Pending"); // Never completes

            jest.useFakeTimers();

            const promise = dcvWrapper.installDCV();

            // Fast-forward time past the timeout (1800 seconds = 1800000ms)
            // Need to advance in 10-second intervals (pollInterval) to trigger checks
            const timeoutMs = 1800000;
            const pollInterval = 10000;
            const numPolls = Math.ceil(timeoutMs / pollInterval) + 2; // +2 to go past timeout

            // Advance timers and let promise reject
            const advancePromise = (async () => {
                for (let i = 0; i < numPolls; i++) {
                    await jest.advanceTimersByTimeAsync(pollInterval);
                }
            })();

            await Promise.all([
                expect(promise).rejects.toThrow(/Timeout waiting for SSM command/),
                advancePromise,
            ]);

            jest.useRealTimers();
        });

        it("should throw error if tagging fails", async () => {
            mockSSMWrapper.runInstall.mockResolvedValue(mockCommandId);
            mockSSMWrapper.getCommandStatus.mockResolvedValue("Success");
            mockEC2Wrapper.modifyInstanceTag.mockRejectedValue(new Error("Tagging failed"));

            await expect(dcvWrapper.installDCV()).rejects.toThrow("Tagging failed");
        });
    });

    describe("createDCVSession", () => {
        it("should successfully create DCV session and return URL", async () => {
            mockSSMWrapper.runCreateSession.mockResolvedValue(mockCommandId);
            mockSSMWrapper.getCommandStatus.mockResolvedValue("Success");
            mockEC2Wrapper.getInstance.mockResolvedValue(
                createMockInstance({ PublicIpAddress: mockPublicIp }),
            );

            const url = await dcvWrapper.createDCVSession();

            expect(mockSSMWrapper.runCreateSession).toHaveBeenCalledWith({
                instanceId: mockInstanceId,
                sessionName: mockSessionName,
                sessionOwner: "Administrator",
            });
            expect(url).toBe(
                `https://${mockPublicIp}:8443?session-id=${encodeURIComponent(mockSessionName)}`,
            );
        });

        it("should wait for session creation to complete", async () => {
            mockSSMWrapper.runCreateSession.mockResolvedValue(mockCommandId);
            mockSSMWrapper.getCommandStatus
                .mockResolvedValueOnce("Pending")
                .mockResolvedValueOnce("Success");
            mockEC2Wrapper.getInstance.mockResolvedValue(createMockInstance());

            jest.useFakeTimers();

            const promise = dcvWrapper.createDCVSession();

            // Advance through polling intervals
            await jest.advanceTimersByTimeAsync(10000);
            await jest.advanceTimersByTimeAsync(10000);

            await promise;

            expect(mockSSMWrapper.getCommandStatus).toHaveBeenCalledTimes(2);

            jest.useRealTimers();
        });

        it("should throw error if session creation fails", async () => {
            // mockSSMWrapper.runCreateSession.mockResolvedValue(mockCommandId);
            mockSSMWrapper.getCommandStatus.mockResolvedValue("Failed");

            await expect(dcvWrapper.createDCVSession()).rejects.toThrow(
                "SSM command failed with status: Failed",
            );
        });

        it("should throw error if public IP is missing", async () => {
            mockSSMWrapper.runCreateSession.mockResolvedValue(mockCommandId);
            mockSSMWrapper.getCommandStatus.mockResolvedValue("Success");
            mockEC2Wrapper.getInstance.mockResolvedValue(
                createMockInstance({ PublicIpAddress: undefined }),
            );

            await expect(dcvWrapper.createDCVSession()).rejects.toThrow("Could not get public Ip");
        });
    });

    describe("stopDCVSession", () => {
        it("should stop DCV session successfully", async () => {
            const mockResult = {
                instanceId: mockInstanceId,
                stoppedSuccessfully: true,
                message: `DCV session closed on ${mockInstanceId}`,
            };

            mockSSMWrapper.runCloseDCVSession.mockResolvedValue(mockCommandId);
            // Spy on private method using 'as any'
            (dcvWrapper as any).waitForSSMCommand = jest.fn().mockResolvedValue("Success");

            const result = await dcvWrapper.stopDCVSession();

            expect(mockSSMWrapper.runCloseDCVSession).toHaveBeenCalledWith(mockInstanceId);
            expect((dcvWrapper as any).waitForSSMCommand).toHaveBeenCalledWith(mockCommandId, 60);
            expect(result).toEqual(mockResult);
        });

        it("should return failed result if SSM command throws an error", async () => {
            mockSSMWrapper.runCloseDCVSession.mockRejectedValue(new Error("SSM failed"));

            const result = await dcvWrapper.stopDCVSession();

            expect(result.stoppedSuccessfully).toBe(false);
            expect(result.message).toMatch(/DCV close-session failed: SSM failed/);
        });

        it("should return failed result if SSM command times out or fails during wait", async () => {
            mockSSMWrapper.runCloseDCVSession.mockResolvedValue(mockCommandId);
            // Spy on private method to throw an error
            (dcvWrapper as any).waitForSSMCommand = jest
                .fn()
                .mockRejectedValue(new Error("Timeout waiting for SSM command"));

            const result = await dcvWrapper.stopDCVSession();

            expect(result.stoppedSuccessfully).toBe(false);
            expect(result.message).toMatch(
                /DCV close-session failed: Timeout waiting for SSM command/,
            );
        });
    });

    describe("getStreamingUrl", () => {
        it("should return correctly formatted streaming URL", async () => {
            mockEC2Wrapper.getInstance.mockResolvedValue(
                createMockInstance({ PublicIpAddress: mockPublicIp }),
            );

            const url = await dcvWrapper.getStreamingUrl();

            expect(url).toBe(
                `https://${mockPublicIp}:8443?session-id=${encodeURIComponent(mockSessionName)}`,
            );
        });

        it("should encode session name in URL", async () => {
            const specialUserId = "user@example.com";
            const specialDcvWrapper = new DCVWrapper(mockInstanceId, specialUserId);
            const specialSessionName = `user-${specialUserId}-session`;

            mockEC2Wrapper.getInstance.mockResolvedValue(createMockInstance());

            const url = await specialDcvWrapper.getStreamingUrl();

            expect(url).toContain(encodeURIComponent(specialSessionName));
        });

        it("should throw error if public IP is missing", async () => {
            mockEC2Wrapper.getInstance.mockResolvedValue(
                createMockInstance({ PublicIpAddress: undefined }),
            );

            await expect(dcvWrapper.getStreamingUrl()).rejects.toThrow("Could not get public Ip");
        });

        it("should throw error if getInstance fails", async () => {
            mockEC2Wrapper.getInstance.mockRejectedValue(new Error("Network error"));

            await expect(dcvWrapper.getStreamingUrl()).rejects.toThrow("Network error");
        });
    });

    describe("waitForSSMCommand", () => {
        it("should return immediately when command succeeds", async () => {
            mockSSMWrapper.runInstall.mockResolvedValue(mockCommandId);
            mockSSMWrapper.getCommandStatus.mockResolvedValue("Success");
            mockEC2Wrapper.modifyInstanceTag.mockResolvedValue();

            await dcvWrapper.installDCV();

            expect(mockSSMWrapper.getCommandStatus).toHaveBeenCalledTimes(1);
        });

        it("should poll until command succeeds", async () => {
            mockSSMWrapper.runInstall.mockResolvedValue(mockCommandId);
            mockSSMWrapper.getCommandStatus
                .mockResolvedValueOnce("Pending")
                .mockResolvedValueOnce("InProgress")
                .mockResolvedValueOnce("InProgress")
                .mockResolvedValueOnce("Success");
            mockEC2Wrapper.modifyInstanceTag.mockResolvedValue();

            jest.useFakeTimers();

            const promise = dcvWrapper.installDCV();

            // Advance through polling intervals
            await jest.advanceTimersByTimeAsync(10000); // First poll
            await jest.advanceTimersByTimeAsync(10000); // Second poll
            await jest.advanceTimersByTimeAsync(10000); // Third poll
            await jest.advanceTimersByTimeAsync(10000); // Fourth poll (succeeds)

            await promise;

            expect(mockSSMWrapper.getCommandStatus).toHaveBeenCalledTimes(4);

            jest.useRealTimers();
        });

        it("should throw error for failed status", async () => {
            mockSSMWrapper.runInstall.mockResolvedValue(mockCommandId);
            mockSSMWrapper.getCommandStatus.mockResolvedValue("Failed");

            await expect(dcvWrapper.installDCV()).rejects.toThrow(
                "SSM command failed with status: Failed",
            );
        });

        it("should throw error for cancelled status", async () => {
            mockSSMWrapper.runInstall.mockResolvedValue(mockCommandId);
            mockSSMWrapper.getCommandStatus.mockResolvedValue("Cancelled");

            await expect(dcvWrapper.installDCV()).rejects.toThrow(
                "SSM command failed with status: Cancelled",
            );
        });

        it("should throw error for timed out status", async () => {
            mockSSMWrapper.runInstall.mockResolvedValue(mockCommandId);
            mockSSMWrapper.getCommandStatus.mockResolvedValue("TimedOut");

            await expect(dcvWrapper.installDCV()).rejects.toThrow(
                "SSM command failed with status: TimedOut",
            );
        });
    });
});
