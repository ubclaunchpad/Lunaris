import IAMWrapper from "../../src/utils/iamWrapper";
import { iamMock, resetAllMocks } from "../__mocks__/aws-mocks";
import {
    CreateRoleCommand,
    GetRoleCommand,
    AttachRolePolicyCommand,
    CreateInstanceProfileCommand,
    AddRoleToInstanceProfileCommand,
    GetInstanceProfileCommand,
    type GetRoleCommandOutput,
    type CreateRoleCommandOutput,
    type GetInstanceProfileCommandOutput,
    type CreateInstanceProfileCommandOutput,
} from "@aws-sdk/client-iam";

describe("IAMWrapper", () => {
    let iamWrapper: IAMWrapper;

    const mockRoleName = "Lunaris-EC2-SSM-Role";
    const mockProfileName = "Lunaris-EC2-SSM-Profile";
    const mockPolicyArn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore";
    const mockProfileArn = "arn:aws:iam::123456789012:instance-profile/Lunaris-EC2-SSM-Profile";

    beforeEach(() => {
        resetAllMocks();
        iamWrapper = new IAMWrapper();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Mock response creators
    const createMockGetRoleResponse = (
        overrides: Partial<GetRoleCommandOutput> = {},
    ): GetRoleCommandOutput => ({
        Role: {
            RoleName: mockRoleName,
            Arn: "arn:aws:iam::123456789012:role/Lunaris-EC2-SSM-Role",
            Path: "/",
            RoleId: "AIDAI23HXI2NADS5EXAMPLE",
            CreateDate: new Date(),
            AssumeRolePolicyDocument: "{}",
            ...overrides.Role,
        },
        $metadata: {
            httpStatusCode: 200,
            requestId: "test-request-id",
            attempts: 1,
            totalRetryDelay: 0,
        },
        ...overrides,
    });

    const createMockCreateRoleResponse = (): CreateRoleCommandOutput => ({
        Role: {
            RoleName: mockRoleName,
            Arn: "arn:aws:iam::123456789012:role/Lunaris-EC2-SSM-Role",
            Path: "/",
            RoleId: "AIDAI23HXI2NADS5EXAMPLE",
            CreateDate: new Date(),
            AssumeRolePolicyDocument: "{}",
        },
        $metadata: {
            httpStatusCode: 200,
            requestId: "test-request-id",
            attempts: 1,
            totalRetryDelay: 0,
        },
    });

    const createMockGetProfileResponse = (
        overrides: Partial<GetInstanceProfileCommandOutput> = {},
    ): GetInstanceProfileCommandOutput => ({
        InstanceProfile: {
            InstanceProfileName: mockProfileName,
            InstanceProfileId: "AIPAI23HXI2NADS5EXAMPLE",
            Arn: mockProfileArn,
            Path: "/",
            CreateDate: new Date(),
            Roles: [
                {
                    RoleName: mockRoleName,
                    Arn: "arn:aws:iam::123456789012:role/Lunaris-EC2-SSM-Role",
                    Path: "/",
                    RoleId: "AIDAI23HXI2NADS5EXAMPLE",
                    CreateDate: new Date(),
                    AssumeRolePolicyDocument: "{}",
                },
            ],
            ...overrides.InstanceProfile,
        },
        $metadata: {
            httpStatusCode: 200,
            requestId: "test-request-id",
            attempts: 1,
            totalRetryDelay: 0,
        },
        ...overrides,
    });

    const createMockCreateProfileResponse = (): CreateInstanceProfileCommandOutput => ({
        InstanceProfile: {
            InstanceProfileName: mockProfileName,
            InstanceProfileId: "AIPAI23HXI2NADS5EXAMPLE",
            Arn: mockProfileArn,
            Path: "/",
            CreateDate: new Date(),
            Roles: [],
        },
        $metadata: {
            httpStatusCode: 200,
            requestId: "test-request-id",
            attempts: 1,
            totalRetryDelay: 0,
        },
    });

    describe("getRole", () => {
        it("should return existing role name if role exists", async () => {
            iamMock.on(GetRoleCommand).resolves(createMockGetRoleResponse());

            const result = await iamWrapper.getRole();

            expect(result).toBe(mockRoleName);
            expect(iamMock.commandCalls(GetRoleCommand)).toHaveLength(1);
            expect(iamMock.commandCalls(CreateRoleCommand)).toHaveLength(0);
        });

        it("should create role if it doesn't exist", async () => {
            iamMock.on(GetRoleCommand).rejects({
                name: "NoSuchEntityException",
                message: "Role not found",
            });
            iamMock.on(CreateRoleCommand).resolves(createMockCreateRoleResponse());
            iamMock.on(AttachRolePolicyCommand).resolves({
                $metadata: {
                    httpStatusCode: 200,
                    requestId: "test",
                    attempts: 1,
                    totalRetryDelay: 0,
                },
            });

            const result = await iamWrapper.getRole();

            expect(result).toBe(mockRoleName);
            expect(iamMock.commandCalls(GetRoleCommand)).toHaveLength(1);
            expect(iamMock.commandCalls(CreateRoleCommand)).toHaveLength(1);
            expect(iamMock.commandCalls(AttachRolePolicyCommand)).toHaveLength(1);
        });

        it("should throw error if role has no name", async () => {
            iamMock
                .on(GetRoleCommand)
                .resolves(createMockGetRoleResponse({ Role: { RoleName: undefined } as any }));

            await expect(iamWrapper.getRole()).rejects.toThrow(
                "Failed to create Role - no name returned",
            );
        });

        it("should throw error for unexpected errors", async () => {
            iamMock.on(GetRoleCommand).rejects(new Error("Access denied"));

            await expect(iamWrapper.getRole()).rejects.toThrow("Access denied");
        });
    });

    describe("createRole", () => {
        it("should successfully create role with SSM policy attached", async () => {
            iamMock.on(CreateRoleCommand).resolves(createMockCreateRoleResponse());
            iamMock.on(AttachRolePolicyCommand).resolves({
                $metadata: {
                    httpStatusCode: 200,
                    requestId: "test",
                    attempts: 1,
                    totalRetryDelay: 0,
                },
            });

            const result = await iamWrapper.createRole();

            expect(result?.RoleName).toBe(mockRoleName);
            expect(iamMock.commandCalls(CreateRoleCommand)).toHaveLength(1);
            expect(iamMock.commandCalls(AttachRolePolicyCommand)).toHaveLength(1);

            // Verify the role has correct trust policy
            const createRoleCall = iamMock.commandCalls(CreateRoleCommand)[0];
            const trustPolicy = JSON.parse(
                createRoleCall.args[0].input.AssumeRolePolicyDocument || "{}",
            );
            expect(trustPolicy.Statement[0].Principal.Service).toBe("ec2.amazonaws.com");
        });

        it("should include proper tags when creating role", async () => {
            iamMock.on(CreateRoleCommand).resolves(createMockCreateRoleResponse());
            iamMock.on(AttachRolePolicyCommand).resolves({
                $metadata: {
                    httpStatusCode: 200,
                    requestId: "test",
                    attempts: 1,
                    totalRetryDelay: 0,
                },
            });

            await iamWrapper.createRole();

            const createRoleCall = iamMock.commandCalls(CreateRoleCommand)[0];
            expect(createRoleCall.args[0].input.Tags).toEqual([
                { Key: "Application", Value: "Lunaris" },
                { Key: "ManagedBy", Value: "Lambda" },
            ]);
        });

        it("should return existing role if EntityAlreadyExistsException occurs", async () => {
            iamMock.on(CreateRoleCommand).rejects({
                name: "EntityAlreadyExistsException",
                message: "Role already exists",
            });
            iamMock.on(GetRoleCommand).resolves(createMockGetRoleResponse());

            const result = await iamWrapper.createRole();

            expect(result?.RoleName).toBe(mockRoleName);
            expect(iamMock.commandCalls(GetRoleCommand)).toHaveLength(1);
        });

        it("should throw error if role creation fails", async () => {
            iamMock.on(CreateRoleCommand).rejects(new Error("Insufficient permissions"));

            await expect(iamWrapper.createRole()).rejects.toThrow("Insufficient permissions");
        });
    });

    describe("attachSSMPolicy", () => {
        it("should successfully attach SSM policy to role", async () => {
            iamMock.on(AttachRolePolicyCommand).resolves({
                $metadata: {
                    httpStatusCode: 200,
                    requestId: "test",
                    attempts: 1,
                    totalRetryDelay: 0,
                },
            });

            await iamWrapper.attachSSMPolicy(mockRoleName, mockPolicyArn);

            const attachCalls = iamMock.commandCalls(AttachRolePolicyCommand);
            expect(attachCalls).toHaveLength(1);
            expect(attachCalls[0].args[0].input.RoleName).toBe(mockRoleName);
            expect(attachCalls[0].args[0].input.PolicyArn).toBe(mockPolicyArn);
        });

        it("should handle policy already attached gracefully", async () => {
            iamMock.on(AttachRolePolicyCommand).rejects({
                name: "LimitExceededException",
                message: "Cannot exceed quota for PolicyRoles",
            });

            await expect(
                iamWrapper.attachSSMPolicy(mockRoleName, mockPolicyArn),
            ).resolves.toBeUndefined();
        });

        it("should throw error for other failures", async () => {
            iamMock.on(AttachRolePolicyCommand).rejects(new Error("Invalid policy ARN"));

            await expect(iamWrapper.attachSSMPolicy(mockRoleName, mockPolicyArn)).rejects.toThrow(
                "Invalid policy ARN",
            );
        });
    });

    describe("getProfile", () => {
        it("should return existing profile ARN if profile exists", async () => {
            iamMock.on(GetInstanceProfileCommand).resolves(createMockGetProfileResponse());

            const result = await iamWrapper.getProfile();

            expect(result).toBe(mockProfileArn);
            expect(iamMock.commandCalls(GetInstanceProfileCommand)).toHaveLength(1);
            expect(iamMock.commandCalls(CreateInstanceProfileCommand)).toHaveLength(0);
        });

        it("should create profile if it doesn't exist", async () => {
            iamMock.on(GetInstanceProfileCommand).rejectsOnce({
                name: "NoSuchEntityException",
                message: "Profile not found",
            });
            iamMock.on(GetRoleCommand).resolves(createMockGetRoleResponse());
            iamMock.on(CreateInstanceProfileCommand).resolves(createMockCreateProfileResponse());
            iamMock.on(AddRoleToInstanceProfileCommand).resolves({
                $metadata: {
                    httpStatusCode: 200,
                    requestId: "test",
                    attempts: 1,
                    totalRetryDelay: 0,
                },
            });

            const result = await iamWrapper.getProfile();

            expect(result).toBe(mockProfileArn);
            expect(iamMock.commandCalls(CreateInstanceProfileCommand)).toHaveLength(1);
            expect(iamMock.commandCalls(AddRoleToInstanceProfileCommand)).toHaveLength(1);
        });

        it("should throw error if profile has no ARN", async () => {
            iamMock
                .on(GetInstanceProfileCommand)
                .resolves(
                    createMockGetProfileResponse({ InstanceProfile: { Arn: undefined } as any }),
                );

            await expect(iamWrapper.getProfile()).rejects.toThrow(
                "Failed to create instance profile - no name returned",
            );
        });

        it("should create role if it doesn't exist when creating profile", async () => {
            iamMock.on(GetInstanceProfileCommand).rejectsOnce({
                name: "NoSuchEntityException",
                message: "Profile not found",
            });
            iamMock.on(GetRoleCommand).rejects({
                name: "NoSuchEntityException",
                message: "Role not found",
            });
            iamMock.on(CreateRoleCommand).resolves(createMockCreateRoleResponse());
            iamMock.on(AttachRolePolicyCommand).resolves({
                $metadata: {
                    httpStatusCode: 200,
                    requestId: "test",
                    attempts: 1,
                    totalRetryDelay: 0,
                },
            });
            iamMock.on(CreateInstanceProfileCommand).resolves(createMockCreateProfileResponse());
            iamMock.on(AddRoleToInstanceProfileCommand).resolves({
                $metadata: {
                    httpStatusCode: 200,
                    requestId: "test",
                    attempts: 1,
                    totalRetryDelay: 0,
                },
            });

            const result = await iamWrapper.getProfile();

            expect(result).toBe(mockProfileArn);
            expect(iamMock.commandCalls(CreateRoleCommand)).toHaveLength(1);
            expect(iamMock.commandCalls(CreateInstanceProfileCommand)).toHaveLength(1);
        });
    });

    describe("createProfile", () => {
        it("should successfully create instance profile", async () => {
            iamMock.on(CreateInstanceProfileCommand).resolves(createMockCreateProfileResponse());

            const result = await iamWrapper.createProfile();

            expect(result?.InstanceProfileName).toBe(mockProfileName);
            expect(result?.Arn).toBe(mockProfileArn);
            expect(iamMock.commandCalls(CreateInstanceProfileCommand)).toHaveLength(1);
        });

        it("should include proper tags when creating profile", async () => {
            iamMock.on(CreateInstanceProfileCommand).resolves(createMockCreateProfileResponse());

            await iamWrapper.createProfile();

            const createProfileCall = iamMock.commandCalls(CreateInstanceProfileCommand)[0];
            expect(createProfileCall.args[0].input.Tags).toEqual([
                { Key: "Application", Value: "Lunaris" },
                { Key: "ManagedBy", Value: "Lambda" },
            ]);
        });

        it("should return existing profile if EntityAlreadyExistsException occurs", async () => {
            iamMock.on(CreateInstanceProfileCommand).rejects({
                name: "EntityAlreadyExistsException",
                message: "Profile already exists",
            });
            iamMock.on(GetInstanceProfileCommand).resolves(createMockGetProfileResponse());

            const result = await iamWrapper.createProfile();

            expect(result?.InstanceProfileName).toBe(mockProfileName);
            expect(iamMock.commandCalls(GetInstanceProfileCommand)).toHaveLength(1);
        });

        it("should throw error for other failures", async () => {
            iamMock.on(CreateInstanceProfileCommand).rejects(new Error("Quota exceeded"));

            await expect(iamWrapper.createProfile()).rejects.toThrow("Quota exceeded");
        });
    });

    describe("attachRoletoProfile", () => {
        it("should successfully attach role to profile", async () => {
            iamMock.on(AddRoleToInstanceProfileCommand).resolves({
                $metadata: {
                    httpStatusCode: 200,
                    requestId: "test",
                    attempts: 1,
                    totalRetryDelay: 0,
                },
            });

            await iamWrapper.attachRoletoProfile(mockProfileName, mockRoleName);

            const attachCalls = iamMock.commandCalls(AddRoleToInstanceProfileCommand);
            expect(attachCalls).toHaveLength(1);
            expect(attachCalls[0].args[0].input.InstanceProfileName).toBe(mockProfileName);
            expect(attachCalls[0].args[0].input.RoleName).toBe(mockRoleName);
        });

        it("should handle role already attached gracefully", async () => {
            iamMock.on(AddRoleToInstanceProfileCommand).rejects({
                name: "LimitExceededException",
                message: "Cannot exceed quota for InstanceProfiles",
            });

            await expect(
                iamWrapper.attachRoletoProfile(mockProfileName, mockRoleName),
            ).resolves.toBeUndefined();
        });

        it("should throw error for other failures", async () => {
            iamMock.on(AddRoleToInstanceProfileCommand).rejects(new Error("Invalid role name"));

            await expect(
                iamWrapper.attachRoletoProfile(mockProfileName, mockRoleName),
            ).rejects.toThrow("Invalid role name");
        });
    });

    describe("Integration scenarios", () => {
        it("should handle full profile creation flow", async () => {
            iamMock.on(GetInstanceProfileCommand).rejectsOnce({
                name: "NoSuchEntityException",
                message: "Profile not found",
            });
            iamMock.on(GetRoleCommand).rejects({
                name: "NoSuchEntityException",
                message: "Role not found",
            });
            iamMock.on(CreateRoleCommand).resolves(createMockCreateRoleResponse());
            iamMock.on(AttachRolePolicyCommand).resolves({
                $metadata: {
                    httpStatusCode: 200,
                    requestId: "test",
                    attempts: 1,
                    totalRetryDelay: 0,
                },
            });
            iamMock.on(CreateInstanceProfileCommand).resolves(createMockCreateProfileResponse());
            iamMock.on(AddRoleToInstanceProfileCommand).resolves({
                $metadata: {
                    httpStatusCode: 200,
                    requestId: "test",
                    attempts: 1,
                    totalRetryDelay: 0,
                },
            });

            const profileArn = await iamWrapper.getProfile();

            expect(profileArn).toBe(mockProfileArn);
            expect(iamMock.commandCalls(CreateRoleCommand)).toHaveLength(1);
            expect(iamMock.commandCalls(AttachRolePolicyCommand)).toHaveLength(1);
            expect(iamMock.commandCalls(CreateInstanceProfileCommand)).toHaveLength(1);
            expect(iamMock.commandCalls(AddRoleToInstanceProfileCommand)).toHaveLength(1);
        });

        it("should handle concurrent Lambda executions gracefully", async () => {
            iamMock.on(GetInstanceProfileCommand).rejectsOnce({
                name: "NoSuchEntityException",
                message: "Profile not found",
            });
            iamMock.on(GetRoleCommand).resolves(createMockGetRoleResponse());
            iamMock.on(CreateInstanceProfileCommand).rejects({
                name: "EntityAlreadyExistsException",
                message: "Profile created by another process",
            });
            iamMock.on(GetInstanceProfileCommand).resolves(createMockGetProfileResponse());
            iamMock.on(AddRoleToInstanceProfileCommand).rejects({
                name: "LimitExceededException",
                message: "Role already attached",
            });

            const profileArn = await iamWrapper.getProfile();

            expect(profileArn).toBe(mockProfileArn);
        });
    });
});
