import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    apiClient,
    ApiError,
    NetworkError,
    type DeployInstanceRequest,
    type TerminateInstanceRequest,
    type GetStreamingLinkRequest,
    type GetDeploymentStatusRequest,
} from "../api-client";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("ApiClient", () => {
    beforeEach(() => {
        mockFetch.mockClear();
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("deployInstance", () => {
        it("should successfully deploy an instance", async () => {
            const request: DeployInstanceRequest = {
                userId: "user123",
                instanceType: "t3.micro",
                amiId: "ami-123456",
            };

            const mockResponse = {
                message: "Instance deployed successfully",
                instanceId: "i-1234567890abcdef0",
                status: "pending",
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: "OK",
                json: async () => mockResponse,
            });

            const result = await apiClient.deployInstance(request);

            expect(result).toEqual(mockResponse);
            expect(mockFetch).toHaveBeenCalledWith("https://test-api.example.com/deployInstance", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(request),
            });
        });

        it("should handle API errors", async () => {
            const request: DeployInstanceRequest = {
                userId: "user123",
                amiId: "ami-123456",
            };

            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
                statusText: "Bad Request",
                json: async () => ({
                    message: "User ID is required",
                }),
            });

            const error = await apiClient.deployInstance(request).catch((e) => e);
            expect(error).toBeInstanceOf(ApiError);
            expect(error.message).toContain("User ID is required");
        });

        it("should handle network errors", async () => {
            const request: DeployInstanceRequest = {
                userId: "user123",
                amiId: "ami-123456",
            };

            mockFetch.mockRejectedValueOnce(new TypeError("Network error"));

            await expect(apiClient.deployInstance(request)).rejects.toThrow(NetworkError);
        });
    });

    describe("terminateInstance", () => {
        it("should successfully terminate an instance", async () => {
            const request: TerminateInstanceRequest = {
                userId: "user123",
            };

            const mockResponse = {
                message: "This is the Terminate Instance handler",
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: "OK",
                json: async () => mockResponse,
            });

            const result = await apiClient.terminateInstance(request);

            expect(result).toEqual(mockResponse);
            expect(mockFetch).toHaveBeenCalledWith(
                "https://test-api.example.com/terminateInstance",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(request),
                },
            );
        });

        it("should handle 400 errors", async () => {
            const request: TerminateInstanceRequest = {
                userId: "",
            };

            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
                statusText: "Bad Request",
                json: async () => ({
                    message: "User id parameter is required",
                }),
            });

            await expect(apiClient.terminateInstance(request)).rejects.toThrow(ApiError);
        });
    });

    describe("getStreamingLink", () => {
        it("should successfully get streaming link", async () => {
            const request: GetStreamingLinkRequest = {
                userId: "user123",
            };

            const mockResponse = {
                userId: "user123",
                message: "Hello, user user123!",
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: "OK",
                json: async () => mockResponse,
            });

            const result = await apiClient.getStreamingLink(request);

            expect(result).toEqual(mockResponse);
            expect(mockFetch).toHaveBeenCalledWith(
                "https://test-api.example.com/streamingLink?userId=user123",
                {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json",
                    },
                },
            );
        });

        it("should handle 400 errors for missing userId", async () => {
            const request: GetStreamingLinkRequest = {
                userId: "",
            };

            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
                statusText: "Bad Request",
                json: async () => ({
                    error: "Bad Request",
                    message: "userId query parameter is required",
                }),
            });

            await expect(apiClient.getStreamingLink(request)).rejects.toThrow(ApiError);
        });

        it("should handle 500 errors", async () => {
            const request: GetStreamingLinkRequest = {
                userId: "user123",
            };

            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: "Internal Server Error",
                json: async () => ({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred",
                }),
            });

            await expect(apiClient.getStreamingLink(request)).rejects.toThrow(ApiError);
        });
    });

    describe("getDeploymentStatus", () => {
        it("should successfully get deployment status - RUNNING", async () => {
            const request: GetDeploymentStatusRequest = {
                userId: "user123",
            };

            const mockResponse = {
                status: "RUNNING" as const,
                deploymentStatus: "deploying" as const,
                message: "Deployment in progress...",
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: "OK",
                json: async () => mockResponse,
            });

            const result = await apiClient.getDeploymentStatus(request);

            expect(result).toEqual(mockResponse);
            expect(mockFetch).toHaveBeenCalledWith(
                "https://test-api.example.com/deployment-status?userId=user123",
                {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json",
                    },
                },
            );
        });

        it("should successfully get deployment status - SUCCEEDED", async () => {
            const request: GetDeploymentStatusRequest = {
                userId: "user123",
            };

            const mockResponse = {
                status: "SUCCEEDED" as const,
                deploymentStatus: "running" as const,
                instanceId: "i-1234567890abcdef0",
                dcvUrl: "https://dcv.example.com",
                message: "Instance is ready for streaming",
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: "OK",
                json: async () => mockResponse,
            });

            const result = await apiClient.getDeploymentStatus(request);

            expect(result).toEqual(mockResponse);
            expect(result.instanceId).toBe("i-1234567890abcdef0");
            expect(result.dcvUrl).toBe("https://dcv.example.com");
        });

        it("should handle 404 errors for not found", async () => {
            const request: GetDeploymentStatusRequest = {
                userId: "user123",
            };

            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: "Not Found",
                json: async () => ({
                    status: "NOT_FOUND",
                    message: "No running instance found for userId: user123",
                }),
            });

            await expect(apiClient.getDeploymentStatus(request)).rejects.toThrow(ApiError);
        });

        it("should handle 400 errors for missing userId", async () => {
            const request: GetDeploymentStatusRequest = {
                userId: "",
            };

            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
                statusText: "Bad Request",
                json: async () => ({
                    status: "FAILED",
                    message: "userId query parameter is required",
                }),
            });

            await expect(apiClient.getDeploymentStatus(request)).rejects.toThrow(ApiError);
        });
    });

    describe("error handling", () => {
        it("should handle non-JSON error responses", async () => {
            const request: DeployInstanceRequest = {
                userId: "user123",
                amiId: "ami-123456",
            };

            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: "Internal Server Error",
                json: async () => {
                    throw new Error("Invalid JSON");
                },
            });

            await expect(apiClient.deployInstance(request)).rejects.toThrow(ApiError);
        });

        it("should handle fetch TypeError", async () => {
            const request: DeployInstanceRequest = {
                userId: "user123",
                amiId: "ami-123456",
            };

            mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

            await expect(apiClient.deployInstance(request)).rejects.toThrow(NetworkError);
        });

        it("should handle unknown errors", async () => {
            const request: DeployInstanceRequest = {
                userId: "user123",
                amiId: "ami-123456",
            };

            mockFetch.mockRejectedValueOnce("Unknown error");

            await expect(apiClient.deployInstance(request)).rejects.toThrow(NetworkError);
        });
    });

    describe("CORS handling", () => {
        it("should include proper headers in requests", async () => {
            const request: DeployInstanceRequest = {
                userId: "user123",
                amiId: "ami-123456",
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: "OK",
                json: async () => ({
                    message: "Success",
                    instanceId: "i-123",
                }),
            });

            await apiClient.deployInstance(request);

            expect(mockFetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        "Content-Type": "application/json",
                    }),
                }),
            );
        });
    });
});
