"use client";

import { useState, useCallback, useEffect } from "react";
import { DCVViewerSimple } from "@/components/dcv-viewer-simple";
import {
    apiClient,
    type GetDeploymentStatusResponse,
    type DeploymentStatus,
} from "@/lib/api-client";
import { useDeploymentStatus } from "@/lib/hooks/useDeploymentStatus";

interface StreamingSession {
    streamingLink: string;
    dcvUser: string;
    dcvPassword?: string;
    dcvIp: string;
    dcvPort: number;
    sessionId?: string;
    instanceId?: string;
}

/**
 * Simple test page for DCV streaming (MVP)
 *
 * This page allows you to:
 * 1. Deploy a new EC2 gaming instance
 * 2. Automatically polls deployment status until ready
 * 3. Fetch streaming credentials from the API
 * 4. Connect and view the remote desktop via DCV
 *
 * MVP Note: Password is returned from backend for DCV SDK authentication.
 * Production should use DCV Session Connection Broker for token-based auth.
 */
export default function StreamingTestPage() {
    const [serverUrl, setServerUrl] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [userId, setUserId] = useState("test123");
    const [showViewer, setShowViewer] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [deploying, setDeploying] = useState(false);
    const [terminating, setTerminating] = useState(false);
    const [hasCredentials, setHasCredentials] = useState(false);
    const [deploymentComplete, setDeploymentComplete] = useState(false);
    const [currentInstanceId, setCurrentInstanceId] = useState<string | null>(null);

    const addLog = useCallback((msg: string) => {
        const timestamp = new Date().toLocaleTimeString();
        setLogs((prev) => [...prev, `[${timestamp}] ${msg}`]);
    }, []);

    // Track previous step to avoid duplicate logs
    const [lastLoggedStep, setLastLoggedStep] = useState<string | null>(null);
    const [lastLoggedTerminateStep, setLastLoggedTerminateStep] = useState<string | null>(null);

    // Handle deployment status changes
    const handleStatusChange = useCallback(
        (status: DeploymentStatus, response: GetDeploymentStatusResponse) => {
            if (status === "RUNNING") {
                // Only log if step changed
                const stepKey = `${response.currentStep}-${response.stepNumber}`;
                if (stepKey !== lastLoggedStep) {
                    const progressInfo =
                        response.progress !== undefined ? ` (${response.progress}% complete)` : "";
                    const stepInfo =
                        response.stepNumber && response.totalSteps
                            ? ` [Step ${response.stepNumber}/${response.totalSteps}]`
                            : "";
                    addLog(
                        `⏳${stepInfo} ${response.currentStepName || response.message}${progressInfo}`,
                    );
                    setLastLoggedStep(stepKey);
                }
            } else if (status === "NOT_FOUND") {
                if (lastLoggedStep !== "NOT_FOUND") {
                    addLog(`🔍 Waiting for deployment to initialize...`);
                    setLastLoggedStep("NOT_FOUND");
                }
            } else if (status === "FAILED") {
                const errorInfo = response.errorStep
                    ? ` at step "${response.failedAt || response.errorStep}"`
                    : "";
                addLog(`❌ Deployment failed${errorInfo}: ${response.message}`);
                if (response.error) {
                    addLog(`   Error type: ${response.error}`);
                }
            }
        },
        [addLog, lastLoggedStep],
    );

    // Handle deployment success
    const handleDeploymentSuccess = useCallback(
        (response: GetDeploymentStatusResponse) => {
            addLog(`✅ Deployment complete! Instance is ready.`);
            if (response.instanceId) {
                addLog(`   Instance ID: ${response.instanceId}`);
                setCurrentInstanceId(response.instanceId);
            }
            if (response.dcvUrl) {
                addLog(`   DCV URL: ${response.dcvUrl}`);
                setServerUrl(response.dcvUrl);
            }
            if (response.startedAt && response.completedAt) {
                const duration = Math.round(
                    (new Date(response.completedAt).getTime() -
                        new Date(response.startedAt).getTime()) /
                        1000,
                );
                addLog(`   Duration: ${Math.floor(duration / 60)}m ${duration % 60}s`);
            }
            setDeploymentComplete(true);
            setDeploying(false);
            addLog(`📋 Click "Get Session" to fetch streaming credentials`);
        },
        [addLog],
    );

    // Handle deployment error
    const handleDeploymentError = useCallback(
        (error: Error) => {
            addLog(`❌ Deployment failed: ${error.message}`);
            setDeploying(false);
        },
        [addLog],
    );

    // Handle termination status changes
    const handleTerminateStatusChange = useCallback(
        (status: DeploymentStatus, response: GetDeploymentStatusResponse) => {
            if (status === "RUNNING") {
                const stepKey = `terminate-${response.currentStep}-${response.stepNumber}`;
                if (stepKey !== lastLoggedTerminateStep) {
                    const progressInfo =
                        response.progress !== undefined ? ` (${response.progress}% complete)` : "";
                    const stepInfo =
                        response.stepNumber && response.totalSteps
                            ? ` [Step ${response.stepNumber}/${response.totalSteps}]`
                            : "";
                    addLog(
                        `🛑${stepInfo} ${response.currentStepName || response.message}${progressInfo}`,
                    );
                    setLastLoggedTerminateStep(stepKey);
                }
            } else if (status === "NOT_FOUND") {
                // After termination succeeds, deployment-status returns NOT_FOUND
                // This is expected - means instance is fully terminated
            } else if (status === "FAILED") {
                const errorInfo = response.errorStep
                    ? ` at step "${response.failedAt || response.errorStep}"`
                    : "";
                addLog(`❌ Termination failed${errorInfo}: ${response.message}`);
                if (response.error) {
                    addLog(`   Error type: ${response.error}`);
                }
            }
        },
        [addLog, lastLoggedTerminateStep],
    );

    // Handle termination success
    const handleTerminateSuccess = useCallback(
        (response: GetDeploymentStatusResponse) => {
            addLog(`✅ Termination complete! Instance has been shut down.`);
            if (response.startedAt && response.completedAt) {
                const duration = Math.round(
                    (new Date(response.completedAt).getTime() -
                        new Date(response.startedAt).getTime()) /
                        1000,
                );
                addLog(`   Duration: ${duration}s`);
            }
            // Clear all state
            setServerUrl("");
            setUsername("");
            setPassword("");
            setHasCredentials(false);
            setCurrentInstanceId(null);
            setDeploymentComplete(false);
            setTerminating(false);
        },
        [addLog],
    );

    // Handle termination error
    const handleTerminateError = useCallback(
        (error: Error) => {
            addLog(`❌ Termination failed: ${error.message}`);
            setTerminating(false);
        },
        [addLog],
    );

    // Set up deployment status polling
    const {
        status: deploymentStatus,
        response: deploymentResponse,
        isPolling,
        isLoading: isPollingLoading,
        startPolling,
        stopPolling,
    } = useDeploymentStatus({
        userId,
        pollInterval: 5000, // Poll every 5 seconds
        onStatusChange: handleStatusChange,
        onSuccess: handleDeploymentSuccess,
        onError: handleDeploymentError,
    });

    // Set up termination status polling
    const {
        status: terminateStatus,
        isPolling: isTerminatePolling,
        startPolling: startTerminatePolling,
        stopPolling: stopTerminatePolling,
    } = useDeploymentStatus({
        userId,
        pollInterval: 3000, // Poll every 3 seconds for termination (faster)
        onStatusChange: handleTerminateStatusChange,
        onSuccess: handleTerminateSuccess,
        onError: handleTerminateError,
    });

    // Stop polling when component unmounts or userId changes
    useEffect(() => {
        return () => {
            stopPolling();
            stopTerminatePolling();
        };
    }, [userId, stopPolling, stopTerminatePolling]);

    // Check for existing deployment/instance on page load
    useEffect(() => {
        const checkExistingDeployment = async () => {
            if (!userId) return;

            try {
                // First check deployment status
                const statusResponse = await apiClient.getDeploymentStatus({ userId });
                if (statusResponse.status === "SUCCEEDED" && statusResponse.instanceId) {
                    addLog(`📋 Found existing deployment for user: ${userId}`);
                    addLog(`   Instance ID: ${statusResponse.instanceId}`);
                    setCurrentInstanceId(statusResponse.instanceId);
                    setDeploymentComplete(true);
                    if (statusResponse.dcvUrl) {
                        setServerUrl(statusResponse.dcvUrl);
                    }
                    return; // Found active deployment, no need to check further
                } else if (statusResponse.status === "RUNNING") {
                    addLog(`⏳ Found in-progress deployment for user: ${userId}`);
                    setDeploying(true);
                    startPolling();
                    return; // Deployment in progress
                } else if (statusResponse.status === "FAILED") {
                    addLog(`⚠️ Previous deployment failed: ${statusResponse.message}`);
                    // Continue to check for existing streams
                }
            } catch {
                // No deployment record found, continue to check streams
            }

            // Also check if there's an existing streaming session (from a previous deployment)
            try {
                const streamResponse = await apiClient.getStreamingLink({ userId });
                const session = streamResponse as unknown as StreamingSession;
                if (session.instanceId) {
                    addLog(`📋 Found existing streaming session for user: ${userId}`);
                    addLog(`   Instance ID: ${session.instanceId}`);
                    setCurrentInstanceId(session.instanceId);
                    setServerUrl(session.streamingLink);
                    setUsername(session.dcvUser);
                    if (session.dcvPassword) {
                        setPassword(session.dcvPassword);
                        setHasCredentials(true);
                    }
                    setDeploymentComplete(true);
                }
            } catch {
                // No streaming session found either
                addLog(
                    `ℹ️ No active instance found for user: ${userId}. Click Deploy to start one.`,
                );
            }
        };

        checkExistingDeployment();
    }, []); // Only run once on mount

    // Reset logged step when starting new deployment
    const deployInstance = async () => {
        if (!userId) {
            addLog("❌ Please enter a User ID");
            return;
        }

        setDeploying(true);
        setDeploymentComplete(false);
        setLastLoggedStep(null); // Reset step tracking
        addLog(`🚀 Deploying new EC2 instance for user: ${userId}...`);
        addLog(`⏳ This may take 2-3 minutes. Status will update automatically...`);

        try {
            const response = await apiClient.deployInstance({ userId });
            addLog(`✅ Deployment workflow started: ${response.message}`);

            // Start polling for deployment status
            addLog(`🔄 Monitoring deployment progress...`);
            startPolling();
        } catch (error) {
            addLog(`❌ Deploy error: ${error instanceof Error ? error.message : "Unknown error"}`);
            setDeploying(false);
        }
    };

    const terminateInstance = async () => {
        if (!userId) {
            addLog("❌ Please enter a User ID");
            return;
        }

        if (!currentInstanceId) {
            addLog("❌ No active instance to terminate. Deploy one first.");
            return;
        }

        setTerminating(true);
        setLastLoggedTerminateStep(null); // Reset step tracking
        addLog(`🛑 Terminating instance ${currentInstanceId} for user: ${userId}...`);

        try {
            const response = await apiClient.terminateInstance({
                userId,
                instanceId: currentInstanceId,
            });
            addLog(`✅ Termination workflow started: ${response.message}`);
            addLog(`🔄 Monitoring termination progress...`);

            // Start polling for termination status
            startTerminatePolling();
        } catch (error) {
            addLog(
                `❌ Terminate error: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
            setTerminating(false);
        }
    };

    const fetchCredentials = async () => {
        if (!userId) {
            addLog("❌ Please enter a User ID");
            return;
        }

        setLoading(true);
        addLog(`🔍 Fetching credentials for user: ${userId}...`);

        try {
            const data = await apiClient.getStreamingLink({ userId });
            const session = data as unknown as StreamingSession;

            addLog(`✅ Found streaming session!`);
            addLog(`   Server: ${session.streamingLink}`);
            addLog(`   User: ${session.dcvUser}`);
            if (session.instanceId) {
                addLog(`   Instance: ${session.instanceId}`);
                setCurrentInstanceId(session.instanceId);
            }

            // Auto-fill the form with credentials
            setServerUrl(session.streamingLink);
            setUsername(session.dcvUser);

            if (session.dcvPassword) {
                setPassword(session.dcvPassword);
                setHasCredentials(true);
                addLog(`🔐 Credentials received - ready to connect`);
            } else {
                setHasCredentials(false);
                addLog(`⚠️ No password in response - enter credentials manually`);
            }
        } catch (error) {
            addLog(`❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
        } finally {
            setLoading(false);
        }
    };

    const handleConnect = () => {
        if (!serverUrl) {
            addLog("❌ Please enter a server URL");
            return;
        }
        if (!username || !password) {
            addLog("⚠️ Missing credentials - please enter username and password");
            return;
        }
        addLog(`🚀 Connecting to ${serverUrl}...`);
        setShowViewer(true);
    };

    const handleDisconnect = () => {
        setShowViewer(false);
        addLog("🔌 Disconnected");
    };

    if (showViewer) {
        return (
            <div className="flex flex-col h-screen pt-[88px]">
                {/* Header */}
                <div className="bg-gray-800 text-white p-2 flex items-center justify-between shrink-0">
                    <span className="font-medium">DCV Viewer - {serverUrl}</span>
                    <button
                        onClick={handleDisconnect}
                        className="px-3 py-1 bg-red-600 rounded text-sm hover:bg-red-700"
                    >
                        Disconnect
                    </button>
                </div>

                {/* Viewer */}
                <div className="flex-1 min-h-0">
                    <DCVViewerSimple
                        serverUrl={serverUrl}
                        username={username}
                        password={password}
                        onConnect={() => addLog("✅ Connected!")}
                        onDisconnect={(reason) =>
                            addLog(`🔌 Disconnected: ${JSON.stringify(reason)}`)
                        }
                        onError={(error) => addLog(`❌ Error: ${error?.message || error}`)}
                    />
                </div>

                {/* Log panel */}
                <div className="bg-black text-green-400 p-2 h-24 overflow-y-auto font-mono text-xs shrink-0">
                    {logs.map((log, i) => (
                        <div key={i}>{log}</div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4 pt-[100px]">
            <div className="w-full max-w-md space-y-6">
                <div className="text-center">
                    <h1 className="text-2xl font-bold mb-2">🖥️ Lunaris Cloud Gaming</h1>
                    <p className="text-gray-400 text-sm">
                        Deploy and stream your cloud gaming instance
                    </p>
                </div>

                <div className="bg-gray-800 rounded-lg p-6 space-y-4">
                    {/* User ID input */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium">User ID</label>
                        <input
                            type="text"
                            value={userId}
                            onChange={(e) => setUserId(e.target.value)}
                            placeholder="Enter your user ID"
                            className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 outline-none"
                        />
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2">
                        <button
                            onClick={deployInstance}
                            disabled={deploying || isPolling || !userId}
                            className="flex-1 py-2 bg-purple-600 rounded font-medium hover:bg-purple-700 transition-colors disabled:opacity-50"
                        >
                            {isPolling
                                ? "🔄 Deploying..."
                                : deploying
                                  ? "Starting..."
                                  : "🚀 Deploy Instance"}
                        </button>
                        <button
                            onClick={fetchCredentials}
                            disabled={loading || !userId || isPolling}
                            className="flex-1 py-2 bg-green-600 rounded font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                        >
                            {loading ? "..." : "🔗 Get Session"}
                        </button>
                        <button
                            onClick={terminateInstance}
                            disabled={
                                terminating || isTerminatePolling || !userId || !currentInstanceId
                            }
                            className="flex-1 py-2 bg-red-600 rounded font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                        >
                            {isTerminatePolling
                                ? "🔄 Terminating..."
                                : terminating
                                  ? "Starting..."
                                  : "🛑 Terminate"}
                        </button>
                    </div>

                    {/* Deployment Status Indicator */}
                    {isPolling && (
                        <div className="bg-blue-900/50 border border-blue-700 rounded-lg p-3 space-y-2">
                            <div className="flex items-center gap-2">
                                <div className="animate-spin h-4 w-4 border-2 border-blue-400 border-t-transparent rounded-full"></div>
                                <span className="text-blue-300 text-sm flex-1">
                                    {deploymentResponse?.currentStepName ||
                                        (deploymentStatus === "NOT_FOUND"
                                            ? "Initializing deployment..."
                                            : "Checking status...")}
                                </span>
                                <button
                                    onClick={stopPolling}
                                    className="text-xs text-blue-400 hover:text-blue-300"
                                >
                                    Cancel
                                </button>
                            </div>
                            {/* Progress bar */}
                            {deploymentResponse?.progress !== undefined &&
                                deploymentResponse.progress > 0 && (
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-xs text-blue-400">
                                            <span>
                                                Step {deploymentResponse.stepNumber}/
                                                {deploymentResponse.totalSteps}
                                            </span>
                                            <span>{deploymentResponse.progress}%</span>
                                        </div>
                                        <div className="w-full bg-blue-950 rounded-full h-2">
                                            <div
                                                className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                                                style={{ width: `${deploymentResponse.progress}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                )}
                        </div>
                    )}

                    {/* Deployment Complete Indicator */}
                    {deploymentComplete && !isPolling && !isTerminatePolling && (
                        <div className="bg-green-900/50 border border-green-700 rounded-lg p-3">
                            <div className="flex items-center gap-2">
                                <span className="text-green-400">✓</span>
                                <span className="text-green-300 text-sm">
                                    Instance deployed! Click "Get Session" to connect.
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Termination Status Indicator */}
                    {isTerminatePolling && (
                        <div className="bg-red-900/50 border border-red-700 rounded-lg p-3 space-y-2">
                            <div className="flex items-center gap-2">
                                <div className="animate-spin h-4 w-4 border-2 border-red-400 border-t-transparent rounded-full"></div>
                                <span className="text-red-300 text-sm flex-1">
                                    {terminateStatus === "RUNNING"
                                        ? "Terminating instance..."
                                        : "Checking termination status..."}
                                </span>
                                <button
                                    onClick={stopTerminatePolling}
                                    className="text-xs text-red-400 hover:text-red-300"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Server URL (auto-filled after Get Session) */}
                    {serverUrl && (
                        <div className="border-t border-gray-700 pt-4 space-y-3">
                            <div>
                                <label className="block text-sm font-medium mb-1">Server</label>
                                <div className="px-3 py-2 bg-gray-700 rounded text-sm text-gray-300 truncate">
                                    {serverUrl}
                                </div>
                            </div>

                            {hasCredentials ? (
                                <p className="text-xs text-green-500">
                                    ✓ Credentials ready - click Start Streaming
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    <p className="text-xs text-yellow-500 mb-2">
                                        ⚠️ Enter credentials manually
                                    </p>
                                    <input
                                        type="text"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        placeholder="Username"
                                        className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 outline-none text-sm"
                                    />
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="Password"
                                        className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 outline-none text-sm"
                                    />
                                </div>
                            )}

                            <button
                                onClick={handleConnect}
                                className="w-full py-3 bg-blue-600 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                            >
                                🎮 Start Streaming
                            </button>
                        </div>
                    )}
                </div>

                {/* Logs */}
                {logs.length > 0 && (
                    <div className="bg-black rounded-lg p-3 max-h-40 overflow-y-auto">
                        <div className="font-mono text-xs text-green-400 space-y-1">
                            {logs.map((log, i) => (
                                <div key={i}>{log}</div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
