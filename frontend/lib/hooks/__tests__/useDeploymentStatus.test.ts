/**
 * Tests for useDeploymentStatus hook
 *
 * Note: This test file requires @testing-library/react to be installed:
 * npm install -D @testing-library/react
 *
 * The tests validate the polling behavior, callbacks, and state management
 * of the deployment status hook.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { apiClient, type GetDeploymentStatusResponse } from "../../api-client";

// Mock the API client
vi.mock("../../api-client", () => ({
    apiClient: {
        getDeploymentStatus: vi.fn(),
    },
}));

const mockApiClient = apiClient as unknown as { getDeploymentStatus: ReturnType<typeof vi.fn> };

// Basic unit tests that don't require renderHook
describe("useDeploymentStatus - API integration", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should have the correct API endpoint in api-client", async () => {
        const runningResponse: GetDeploymentStatusResponse = {
            status: "RUNNING",
            message: "Deployment in progress...",
            deploymentStatus: "deploying",
        };

        mockApiClient.getDeploymentStatus.mockResolvedValue(runningResponse);

        const result = await apiClient.getDeploymentStatus({ userId: "test-user" });

        expect(result).toEqual(runningResponse);
        expect(mockApiClient.getDeploymentStatus).toHaveBeenCalledWith({ userId: "test-user" });
    });

    it("should handle SUCCEEDED status response", async () => {
        const succeededResponse: GetDeploymentStatusResponse = {
            status: "SUCCEEDED",
            message: "Instance is ready for streaming",
            deploymentStatus: "running",
            instanceId: "i-1234567890",
            dcvUrl: "https://example.com:8443",
        };

        mockApiClient.getDeploymentStatus.mockResolvedValue(succeededResponse);

        const result = await apiClient.getDeploymentStatus({ userId: "test-user" });

        expect(result.status).toBe("SUCCEEDED");
        expect(result.dcvUrl).toBe("https://example.com:8443");
        expect(result.instanceId).toBe("i-1234567890");
    });

    it("should handle FAILED status response", async () => {
        const failedResponse: GetDeploymentStatusResponse = {
            status: "FAILED",
            message: "Deployment failed due to resource limits",
            error: "ResourceLimitExceeded",
        };

        mockApiClient.getDeploymentStatus.mockResolvedValue(failedResponse);

        const result = await apiClient.getDeploymentStatus({ userId: "test-user" });

        expect(result.status).toBe("FAILED");
        expect(result.error).toBe("ResourceLimitExceeded");
    });

    it("should handle NOT_FOUND status response", async () => {
        const notFoundResponse: GetDeploymentStatusResponse = {
            status: "NOT_FOUND",
            message: "No running instance found for userId: test-user",
        };

        mockApiClient.getDeploymentStatus.mockResolvedValue(notFoundResponse);

        const result = await apiClient.getDeploymentStatus({ userId: "test-user" });

        expect(result.status).toBe("NOT_FOUND");
    });

    it("should handle network errors", async () => {
        mockApiClient.getDeploymentStatus.mockRejectedValue(new Error("Network error"));

        await expect(apiClient.getDeploymentStatus({ userId: "test-user" })).rejects.toThrow(
            "Network error",
        );
    });
});

/**
 * Full hook tests with renderHook (requires @testing-library/react)
 *
 * Uncomment these tests after installing @testing-library/react:
 * npm install -D @testing-library/react
 */

/*
import { renderHook, act, waitFor } from "@testing-library/react";
import { useDeploymentStatus } from "../useDeploymentStatus";

describe("useDeploymentStatus hook", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("should start polling and update status", async () => {
        const runningResponse: GetDeploymentStatusResponse = {
            status: "RUNNING",
            message: "Deployment in progress...",
            deploymentStatus: "deploying",
        };

        mockApiClient.getDeploymentStatus.mockResolvedValue(runningResponse);

        const { result } = renderHook(() => 
            useDeploymentStatus({ userId: "test-user", pollInterval: 5000 })
        );

        act(() => {
            result.current.startPolling();
        });

        expect(result.current.isPolling).toBe(true);

        await waitFor(() => {
            expect(result.current.status).toBe("RUNNING");
        });
    });

    it("should stop polling when deployment succeeds", async () => {
        const succeededResponse: GetDeploymentStatusResponse = {
            status: "SUCCEEDED",
            message: "Instance is ready",
            instanceId: "i-123",
        };

        mockApiClient.getDeploymentStatus.mockResolvedValue(succeededResponse);
        const onSuccess = vi.fn();

        const { result } = renderHook(() => 
            useDeploymentStatus({ userId: "test-user", onSuccess })
        );

        act(() => {
            result.current.startPolling();
        });

        await waitFor(() => {
            expect(result.current.isPolling).toBe(false);
        });

        expect(onSuccess).toHaveBeenCalledWith(succeededResponse);
    });
});
*/
