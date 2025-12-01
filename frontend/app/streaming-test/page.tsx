"use client";

import { useState } from "react";
import { DCVViewerSimple } from "@/components/dcv-viewer-simple";

const API_BASE_URL = "https://snmonwfes7.execute-api.us-west-2.amazonaws.com/prod";

interface StreamingSession {
    streamingLink: string;
    dcvUser: string;
    dcvPassword: string;
    dcvIp: string;
    dcvPort: number;
    sessionId?: string;
    authToken?: string;
}

/**
 * Simple test page for DCV streaming
 *
 * This page allows you to:
 * 1. Enter a userId to fetch credentials from the API
 * 2. Or manually enter server URL and credentials
 * 3. Connect and view the remote desktop
 */
export default function StreamingTestPage() {
    const [serverUrl, setServerUrl] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [userId, setUserId] = useState("test123");
    const [showViewer, setShowViewer] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    const addLog = (msg: string) => {
        const timestamp = new Date().toLocaleTimeString();
        setLogs((prev) => [...prev, `[${timestamp}] ${msg}`]);
    };

    const fetchCredentials = async () => {
        if (!userId) {
            addLog("❌ Please enter a User ID");
            return;
        }

        setLoading(true);
        addLog(`🔍 Fetching credentials for user: ${userId}...`);

        try {
            const response = await fetch(
                `${API_BASE_URL}/streamingLink?userId=${encodeURIComponent(userId)}`,
            );
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Failed to fetch streaming session");
            }

            const session = data as StreamingSession;
            addLog(`✅ Found streaming session!`);
            addLog(`   Server: ${session.streamingLink}`);
            addLog(`   User: ${session.dcvUser}`);

            // Auto-fill the form
            setServerUrl(session.streamingLink);
            setUsername(session.dcvUser);
            setPassword(session.dcvPassword);
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
            addLog("⚠️ No credentials provided - you may be prompted to enter them");
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
                    <h1 className="text-2xl font-bold mb-2">🖥️ DCV Streaming Test</h1>
                    <p className="text-gray-400 text-sm">
                        Connect directly to a DCV server for testing
                    </p>
                </div>

                <div className="bg-gray-800 rounded-lg p-6 space-y-4">
                    {/* Fetch from API section */}
                    <div className="space-y-3">
                        <label className="block text-sm font-medium">
                            Fetch Credentials from API
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={userId}
                                onChange={(e) => setUserId(e.target.value)}
                                placeholder="User ID (e.g., test123)"
                                className="flex-1 px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 outline-none"
                            />
                            <button
                                onClick={fetchCredentials}
                                disabled={loading}
                                className="px-4 py-2 bg-green-600 rounded font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                            >
                                {loading ? "..." : "Fetch"}
                            </button>
                        </div>
                        <p className="text-xs text-gray-500">
                            Enter your User ID to auto-fill server URL and credentials
                        </p>
                    </div>

                    <div className="border-t border-gray-700 pt-4">
                        <label className="block text-sm font-medium mb-1">Server URL</label>
                        <input
                            type="text"
                            value={serverUrl}
                            onChange={(e) => setServerUrl(e.target.value)}
                            placeholder="https://your-dcv-server:8443"
                            className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 outline-none"
                        />
                    </div>

                    <div className="space-y-3">
                        <label className="block text-sm font-medium">Credentials</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Username"
                            className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 outline-none"
                        />
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Password"
                            className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 outline-none"
                        />
                        {username && password && (
                            <p className="text-xs text-green-500">✓ Credentials ready</p>
                        )}
                    </div>

                    <button
                        onClick={handleConnect}
                        disabled={!serverUrl}
                        className="w-full py-3 bg-blue-600 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                        Connect to DCV Server
                    </button>
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
