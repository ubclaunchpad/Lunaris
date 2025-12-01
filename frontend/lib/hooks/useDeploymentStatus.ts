"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiClient, type GetDeploymentStatusResponse, type DeploymentStatus } from "../api-client";

export interface UseDeploymentStatusOptions {
    /** User ID to poll status for */
    userId: string;
    /** Polling interval in milliseconds (default: 5000ms) */
    pollInterval?: number;
    /** Whether to start polling immediately (default: false) */
    autoStart?: boolean;
    /** Callback when deployment succeeds */
    onSuccess?: (response: GetDeploymentStatusResponse) => void;
    /** Callback when deployment fails */
    onError?: (error: Error) => void;
    /** Callback on each status update */
    onStatusChange?: (status: DeploymentStatus, response: GetDeploymentStatusResponse) => void;
}

export interface UseDeploymentStatusReturn {
    /** Current deployment status */
    status: DeploymentStatus | null;
    /** Full response from the API */
    response: GetDeploymentStatusResponse | null;
    /** Whether polling is currently active */
    isPolling: boolean;
    /** Whether a request is currently in flight */
    isLoading: boolean;
    /** Error if the last request failed */
    error: Error | null;
    /** Start polling for deployment status */
    startPolling: () => void;
    /** Stop polling */
    stopPolling: () => void;
    /** Manually check status once */
    checkStatus: () => Promise<GetDeploymentStatusResponse | null>;
}

/**
 * Custom hook for polling EC2 deployment status
 *
 * Polls the deployment-status API endpoint to track Step Function progress
 * for both deploy and terminate operations.
 *
 * @example
 * ```tsx
 * const { status, isPolling, startPolling, stopPolling } = useDeploymentStatus({
 *   userId: "user123",
 *   pollInterval: 5000,
 *   onSuccess: (response) => {
 *     console.log("Deployment succeeded!", response.dcvUrl);
 *   },
 * });
 * ```
 */
export function useDeploymentStatus({
    userId,
    pollInterval = 5000,
    autoStart = false,
    onSuccess,
    onError,
    onStatusChange,
}: UseDeploymentStatusOptions): UseDeploymentStatusReturn {
    const [status, setStatus] = useState<DeploymentStatus | null>(null);
    const [response, setResponse] = useState<GetDeploymentStatusResponse | null>(null);
    const [isPolling, setIsPolling] = useState(autoStart);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const mountedRef = useRef(true);

    // Cleanup on unmount
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, []);

    const checkStatus = useCallback(async (): Promise<GetDeploymentStatusResponse | null> => {
        if (!userId) {
            return null;
        }

        setIsLoading(true);
        setError(null);

        try {
            const result = await apiClient.getDeploymentStatus({ userId });

            if (!mountedRef.current) return null;

            setResponse(result);
            setStatus(result.status);

            // Call status change callback
            onStatusChange?.(result.status, result);

            // Check for terminal states
            if (result.status === "SUCCEEDED") {
                onSuccess?.(result);
                // Stop polling on success
                if (intervalRef.current) {
                    clearInterval(intervalRef.current);
                    intervalRef.current = null;
                    setIsPolling(false);
                }
            } else if (result.status === "FAILED") {
                const err = new Error(result.message || "Deployment failed");
                setError(err);
                onError?.(err);
                // Stop polling on failure
                if (intervalRef.current) {
                    clearInterval(intervalRef.current);
                    intervalRef.current = null;
                    setIsPolling(false);
                }
            }

            return result;
        } catch (err) {
            if (!mountedRef.current) return null;

            const error = err instanceof Error ? err : new Error("Unknown error");
            setError(error);

            // Don't stop polling on network errors - might be temporary
            // But do call the error callback
            if (error.message.includes("NOT_FOUND") || error.message.includes("404")) {
                // No deployment found yet - this is expected right after deploy starts
                setStatus("NOT_FOUND");
            }

            return null;
        } finally {
            if (mountedRef.current) {
                setIsLoading(false);
            }
        }
    }, [userId, onSuccess, onError, onStatusChange]);

    const startPolling = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
        }

        setIsPolling(true);
        setError(null);

        // Check immediately
        checkStatus();

        // Then set up interval
        intervalRef.current = setInterval(() => {
            checkStatus();
        }, pollInterval);
    }, [checkStatus, pollInterval]);

    const stopPolling = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        setIsPolling(false);
    }, []);

    // Auto-start polling if enabled
    useEffect(() => {
        if (autoStart && userId) {
            startPolling();
        }

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [autoStart, userId]); // Don't include startPolling to avoid infinite loop

    // Cleanup interval when userId changes
    useEffect(() => {
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [userId]);

    return {
        status,
        response,
        isPolling,
        isLoading,
        error,
        startPolling,
        stopPolling,
        checkStatus,
    };
}

export default useDeploymentStatus;
