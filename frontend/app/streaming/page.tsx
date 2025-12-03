"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DCVViewerSimple } from "@/components/dcv-viewer-simple";

interface StreamingPageState {
    serverUrl: string;
    username: string;
    password: string;
    gameId?: string;
    gameName?: string;
}

/**
 * Streaming page that connects to a DCV server
 *
 * Expected URL parameters:
 * - serverUrl: The DCV server URL
 * - username: DCV username
 * - password: DCV password
 * - gameId: (optional) ID of the game being streamed
 * - gameName: (optional) Name of the game being streamed
 */
export default function StreamingPage() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [state, setState] = useState<StreamingPageState | null>(null);
    const [logs, setLogs] = useState<string[]>([]);

    useEffect(() => {
        // Get connection details from URL params
        const serverUrl = searchParams.get("serverUrl");
        const username = searchParams.get("username");
        const password = searchParams.get("password");
        const gameId = searchParams.get("gameId") || undefined;
        const gameName = searchParams.get("gameName") || undefined;

        if (!serverUrl || !username || !password) {
            addLog("❌ Missing connection details. Redirecting...");
            setTimeout(() => router.push("/browse"), 2000);
            return;
        }

        setState({
            serverUrl,
            username,
            password,
            gameId,
            gameName,
        });

        addLog(`🎮 Starting stream for ${gameName || "game"}...`);
    }, [searchParams, router]);

    const addLog = (msg: string) => {
        const timestamp = new Date().toLocaleTimeString();
        setLogs((prev) => [...prev, `[${timestamp}] ${msg}`]);
    };

    const handleDisconnect = () => {
        addLog("🔌 Disconnecting...");
        router.push("/browse");
    };

    if (!state) {
        return (
            <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                    <p>Loading streaming session...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen pt-[88px]">
            {/* Header */}
            <div className="bg-gray-800 text-white p-2 flex items-center justify-between shrink-0">
                <span className="font-medium">
                    {state.gameName || "Game"} - {state.serverUrl}
                </span>
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
                    serverUrl={state.serverUrl}
                    username={state.username}
                    password={state.password}
                    onConnect={() => addLog("✅ Connected to game server!")}
                    onDisconnect={(reason) => addLog(`🔌 Disconnected: ${JSON.stringify(reason)}`)}
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
