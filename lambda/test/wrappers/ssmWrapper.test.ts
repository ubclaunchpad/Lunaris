import SSMWrapper from "../../src/utils/ssmWrapper";
import { ssmMock, resetAllMocks } from "../__mocks__/aws-mocks";
import {
    SendCommandCommand,
    GetDocumentCommand,
    CreateDocumentCommand,
    GetCommandInvocationCommand,
    GetParameterCommand,
    PutParameterCommand,
    type SendCommandCommandOutput,
    type GetDocumentCommandOutput,
    type GetCommandInvocationCommandOutput,
    type GetParameterCommandOutput,
} from "@aws-sdk/client-ssm";

describe("SSMWrapper", () => {
    let ssmWrapper: SSMWrapper;

    const mockInstanceId = "i-1234567890abcdef0";
    const mockCommandId = "cmd-1234567890abcdef0";
    const mockDocumentName = "Lunaris-Install-DCV-Document";
    const mockSessionName = "user-test-session";

    beforeEach(() => {
        resetAllMocks();
        ssmWrapper = new SSMWrapper();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Mock response creators
    const createMockSendCommandResponse = (
        overrides: Partial<SendCommandCommandOutput> = {},
    ): SendCommandCommandOutput => ({
        Command: {
            CommandId: mockCommandId,
            DocumentName: mockDocumentName,
            InstanceIds: [mockInstanceId],
            Status: "Pending",
            RequestedDateTime: new Date(),
            ...overrides.Command,
        },
        $metadata: {
            httpStatusCode: 200,
            requestId: "test-request-id",
            attempts: 1,
            totalRetryDelay: 0,
        },
        ...overrides,
    });

    const createMockGetDocumentResponse = (
        overrides: Partial<GetDocumentCommandOutput> = {},
    ): GetDocumentCommandOutput => ({
        Name: mockDocumentName,
        DocumentVersion: "1",
        Status: "Active",
        Content: "mock-yaml-content",
        DocumentType: "Command",
        DocumentFormat: "YAML",
        $metadata: {
            httpStatusCode: 200,
            requestId: "test-request-id",
            attempts: 1,
            totalRetryDelay: 0,
        },
        ...overrides,
    });

    const createMockGetCommandInvocationResponse = (
        status: string,
    ): GetCommandInvocationCommandOutput => ({
        CommandId: mockCommandId,
        InstanceId: mockInstanceId,
        Status: status as any,
        StatusDetails: status,
        StandardOutputContent: "FINAL_DCV_URL=https://1.2.3.4:8443?session-id=test",
        StandardErrorContent: "",
        $metadata: {
            httpStatusCode: 200,
            requestId: "test-request-id",
            attempts: 1,
            totalRetryDelay: 0,
        },
    });

    const createMockGetParameterResponse = (value: string): GetParameterCommandOutput => ({
        Parameter: {
            Name: "test-param",
            Value: value,
            Type: "String",
            Version: 1,
            ARN: "arn:aws:ssm:us-east-1:123456789012:parameter/test-param",
        },
        $metadata: {
            httpStatusCode: 200,
            requestId: "test-request-id",
            attempts: 1,
            totalRetryDelay: 0,
        },
    });

    describe("runInstall", () => {
        it("should successfully send install DCV command", async () => {
            ssmMock.on(GetDocumentCommand).resolves(createMockGetDocumentResponse());
            ssmMock.on(SendCommandCommand).resolves(createMockSendCommandResponse());

            const result = await ssmWrapper.runInstall({
                instanceId: mockInstanceId,
            });

            expect(result).toBe(mockCommandId);
            expect(ssmMock.calls()).toHaveLength(2); // GetDocument + SendCommand
        });

        it("should create document if it doesn't exist", async () => {
            ssmMock.on(GetDocumentCommand).rejects({
                name: "InvalidDocument",
                message: "Document not found",
            });
            ssmMock.on(CreateDocumentCommand).resolves({
                DocumentDescription: { Name: mockDocumentName },
                $metadata: {
                    httpStatusCode: 200,
                    requestId: "test",
                    attempts: 1,
                    totalRetryDelay: 0,
                },
            });
            ssmMock.on(SendCommandCommand).resolves(createMockSendCommandResponse());

            const result = await ssmWrapper.runInstall({
                instanceId: mockInstanceId,
            });

            expect(result).toBe(mockCommandId);
            expect(ssmMock.calls()).toHaveLength(3); // GetDocument + CreateDocument + SendCommand
        });

        it("should pass custom DCV MSI URL if provided", async () => {
            const customUrl = "https://custom-url.com/dcv.msi";
            ssmMock.on(GetDocumentCommand).resolves(createMockGetDocumentResponse());
            ssmMock.on(SendCommandCommand).resolves(createMockSendCommandResponse());

            await ssmWrapper.runInstall({
                instanceId: mockInstanceId,
                dcvMsiUrl: customUrl,
            });

            const sendCommandCalls = ssmMock.commandCalls(SendCommandCommand);
            expect(sendCommandCalls[0].args[0].input.Parameters).toEqual({
                DcvMsiUrl: [customUrl],
            });
        });

        it("should throw error if SendCommand fails", async () => {
            ssmMock.on(GetDocumentCommand).resolves(createMockGetDocumentResponse());
            ssmMock.on(SendCommandCommand).rejects(new Error("SSM service error"));

            await expect(
                ssmWrapper.runInstall({
                    instanceId: mockInstanceId,
                }),
            ).rejects.toThrow("SSM service error");
        });
    });

    describe("runCreateSession", () => {
        it("should successfully send create session command", async () => {
            ssmMock.on(GetDocumentCommand).resolves(
                createMockGetDocumentResponse({
                    Name: "Lunaris-Run-DCV-Session-Document",
                }),
            );
            ssmMock.on(SendCommandCommand).resolves(createMockSendCommandResponse());

            const result = await ssmWrapper.runCreateSession({
                instanceId: mockInstanceId,
                sessionName: mockSessionName,
            });

            expect(result).toBe(mockCommandId);
        });

        it("should include session owner if provided", async () => {
            ssmMock.on(GetDocumentCommand).resolves(createMockGetDocumentResponse());
            ssmMock.on(SendCommandCommand).resolves(createMockSendCommandResponse());

            await ssmWrapper.runCreateSession({
                instanceId: mockInstanceId,
                sessionName: mockSessionName,
                sessionOwner: "Administrator",
            });

            const sendCommandCalls = ssmMock.commandCalls(SendCommandCommand);
            expect(sendCommandCalls[0].args[0].input.Parameters).toEqual({
                SessionName: [mockSessionName],
                SessionOwner: ["Administrator"],
            });
        });

        it("should throw error if session name is missing", async () => {
            await expect(
                ssmWrapper.runCreateSession({
                    instanceId: mockInstanceId,
                    sessionName: "",
                    sessionOwner: "Administrator",
                }),
            ).rejects.toThrow();
        });
    });

    describe("getCommandStatus", () => {
        it("should return command status successfully", async () => {
            ssmMock
                .on(GetCommandInvocationCommand)
                .resolves(createMockGetCommandInvocationResponse("Success"));

            const status = await ssmWrapper.getCommandStatus(mockCommandId, mockInstanceId);

            expect(status).toBe("Success");
        });

        it("should handle different command statuses", async () => {
            const statuses = [
                "Pending",
                "InProgress",
                "Success",
                "Failed",
                "TimedOut",
                "Cancelled",
            ];
            for (const expectedStatus of statuses) {
                ssmMock
                    .on(GetCommandInvocationCommand)
                    .resolves(createMockGetCommandInvocationResponse(expectedStatus));

                const status = await ssmWrapper.getCommandStatus(mockCommandId, mockInstanceId);

                expect(status).toBe(expectedStatus);
                ssmMock.reset();
            }
        });

        it("should throw error if GetCommandInvocation fails", async () => {
            ssmMock.on(GetCommandInvocationCommand).rejects(new Error("Command not found"));

            await expect(
                ssmWrapper.getCommandStatus(mockCommandId, mockInstanceId),
            ).rejects.toThrow("Command not found");
        });
    });

    describe("getParamFromParamStore", () => {
        it("should successfully retrieve parameter value", async () => {
            const expectedValue = "ami-1234567890abcdef0";
            ssmMock.on(GetParameterCommand).resolves(createMockGetParameterResponse(expectedValue));

            const result = await ssmWrapper.getParamFromParamStore("test-param");

            expect(result).toBe(expectedValue);
        });

        it("should return undefined if parameter not found", async () => {
            ssmMock.on(GetParameterCommand).rejects({
                name: "ParameterNotFound",
                message: "Parameter not found",
            });

            const result = await ssmWrapper.getParamFromParamStore("nonexistent-param");

            expect(result).toEqual("");
        });
    });

    describe("putParamInParamStore", () => {
        it("should successfully store parameter", async () => {
            ssmMock.on(PutParameterCommand).resolves({
                Version: 1,
                $metadata: {
                    httpStatusCode: 200,
                    requestId: "test",
                    attempts: 1,
                    totalRetryDelay: 0,
                },
            });

            await ssmWrapper.putParamInParamStore("test-param", "test-value");

            const putCalls = ssmMock.commandCalls(PutParameterCommand);
            expect(putCalls).toHaveLength(1);
            expect(putCalls[0].args[0].input.Name).toBe("test-param");
            expect(putCalls[0].args[0].input.Value).toBe("test-value");
        });

        it("should store parameter and return version", async () => {
            ssmMock.on(PutParameterCommand).resolves({
                Version: 2,
                $metadata: {
                    httpStatusCode: 200,
                    requestId: "test",
                    attempts: 1,
                    totalRetryDelay: 0,
                },
            });

            const version = await ssmWrapper.putParamInParamStore("existing-param", "new-value");

            expect(version).toBe(2);
            const putCalls = ssmMock.commandCalls(PutParameterCommand);
            expect(putCalls).toHaveLength(1);
            expect(putCalls[0].args[0].input.Name).toBe("existing-param");
            expect(putCalls[0].args[0].input.Value).toBe("new-value");
        });

        it("should throw error if put fails", async () => {
            ssmMock.on(PutParameterCommand).rejects(new Error("Invalid parameter"));

            await expect(ssmWrapper.putParamInParamStore("test-param", "value")).rejects.toThrow(
                "Invalid parameter",
            );
        });
    });
});
