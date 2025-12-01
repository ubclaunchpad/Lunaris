"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";

/**
 * Simple DCV Viewer Component
 *
 * Connects to an AWS DCV server using the Web Client SDK.
 * Handles authentication and session connection automatically.
 */

interface DCVViewerSimpleProps {
    serverUrl: string;
    // Credentials for DCV authentication
    username?: string;
    password?: string;
    onConnect?: () => void;
    onDisconnect?: (reason: any) => void;
    onError?: (error: any) => void;
}

declare global {
    interface Window {
        dcv?: any;
    }
}

let sdkLoadPromise: Promise<any> | null = null;

async function loadDCVSDK(): Promise<any> {
    if (window.dcv) {
        return window.dcv;
    }

    if (sdkLoadPromise) {
        return sdkLoadPromise;
    }

    sdkLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "/dcv/nice-dcv-web-client-sdk/dcvjs-umd/dcv.js";
        script.async = true;

        script.onload = () => {
            setTimeout(() => {
                if (window.dcv) {
                    resolve(window.dcv);
                } else {
                    // Reset promise so it can be retried
                    sdkLoadPromise = null;
                    reject(new Error("DCV SDK loaded but not accessible"));
                }
            }, 100);
        };

        script.onerror = () => {
            // Reset promise so it can be retried
            sdkLoadPromise = null;
            reject(new Error("Failed to load DCV SDK script"));
        };

        document.head.appendChild(script);
    });

    return sdkLoadPromise;
}

export function DCVViewerSimple({
    serverUrl,
    username = "",
    password = "",
    onConnect,
    onDisconnect,
    onError,
}: DCVViewerSimpleProps) {
    const [status, setStatus] = useState<
        "loading" | "authenticating" | "ready-to-connect" | "connected" | "error"
    >("loading");
    const [error, setError] = useState<string>("");
    const [credentials, setCredentials] = useState({ username, password });
    const [needsCredentials, setNeedsCredentials] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const dcvRef = useRef<any>(null);
    const authHandlerRef = useRef<any>(null);
    const connectionRef = useRef<any>(null);
    const authStartedRef = useRef(false); // Prevent multiple auth attempts
    const mountedRef = useRef(true); // Track if component is mounted

    // Sync credentials when props change
    useEffect(() => {
        setCredentials({ username, password });
    }, [username, password]);

    // Load SDK on mount
    useEffect(() => {
        mountedRef.current = true;

        loadDCVSDK()
            .then((dcv) => {
                if (!mountedRef.current) return;
                dcvRef.current = dcv;
                setStatus("authenticating");
            })
            .catch((err) => {
                if (!mountedRef.current) return;
                setError(err.message);
                setStatus("error");
                onError?.(err);
            });

        return () => {
            mountedRef.current = false;
        };
    }, []);

    // Start authentication when SDK is ready
    useEffect(() => {
        if (status !== "authenticating" || !dcvRef.current) return;

        // Prevent multiple authentication attempts
        if (authStartedRef.current) return;
        authStartedRef.current = true;

        const dcv = dcvRef.current;
        dcv.setLogLevel(1); // WARN level (less verbose)

        // DCV SDK authentication flow - use credentials
        authHandlerRef.current = dcv.authenticate(serverUrl, {
            promptCredentials: () => {
                if (!mountedRef.current) return;
                setNeedsCredentials(true);

                // If we have credentials, send them automatically
                if (credentials.username && credentials.password) {
                    authHandlerRef.current.sendCredentials(credentials);
                }
            },

            success: (authenticationData: any, sessionList: any) => {
                if (!mountedRef.current) return;
                setNeedsCredentials(false);

                // Extract session info from sessionList
                let sessionId = "console";
                let sessionToken = "";

                if (Array.isArray(sessionList) && sessionList.length > 0) {
                    const session = sessionList[0];
                    sessionId = session.sessionId || session.id || sessionId;
                    sessionToken = session.authToken || session.authenticationToken || "";
                }

                // Fallback: check if authHandler has methods to get the token
                if (!sessionToken && authenticationData) {
                    if (typeof authenticationData.getAuthToken === "function") {
                        sessionToken = authenticationData.getAuthToken();
                    } else if (typeof authenticationData.getSessionToken === "function") {
                        sessionToken = authenticationData.getSessionToken();
                    }
                }

                // Connect after render
                setStatus("ready-to-connect");
                setTimeout(() => {
                    if (mountedRef.current) {
                        connectToSession(dcv, sessionId, sessionToken);
                    }
                }, 100);
            },

            error: (authError: any) => {
                if (!mountedRef.current) return;
                console.error("DCV authentication error:", authError);

                const errorMsg = authError.message || String(authError);
                if (errorMsg.includes("1006") || errorMsg.includes("WebSocket")) {
                    setError(
                        `Connection failed. The DCV server may be unreachable or a firewall is blocking the connection.`,
                    );
                } else {
                    setError(`Authentication failed: ${errorMsg}`);
                }
                setStatus("error");
                onError?.(authError);
            },
        });

        return () => {
            if (connectionRef.current) {
                try {
                    connectionRef.current.disconnect();
                } catch (e) {
                    // ignore cleanup errors
                }
            }
        };
    }, [status, serverUrl]);

    const connectToSession = useCallback(
        (dcv: any, sessionId: string, token: string) => {
            if (!containerRef.current) {
                setError("Container not ready");
                setStatus("error");
                return;
            }

            // Base URL for DCV SDK assets (worker scripts, etc.)
            const sdkBaseUrl = `${window.location.origin}/dcv/nice-dcv-web-client-sdk/dcvjs-umd/`;

            dcv.connect({
                url: serverUrl,
                sessionId: sessionId,
                authToken: token,
                divId: containerRef.current.id,
                baseUrl: sdkBaseUrl,
                callbacks: {
                    firstFrame: () => {
                        setStatus("connected");
                        onConnect?.();
                    },
                    disconnect: (reason: any) => {
                        setStatus("error");
                        setError(`Disconnected: ${reason?.message || JSON.stringify(reason)}`);
                        onDisconnect?.(reason);
                    },
                    error: (err: any) => {
                        console.error("DCV connection error:", err);
                        setError(`Connection error: ${err?.message || JSON.stringify(err)}`);
                        setStatus("error");
                        onError?.(err);
                    },
                },
            })
                .then((connection: any) => {
                    connectionRef.current = connection;
                })
                .catch((err: any) => {
                    console.error("DCV connect failed:", err);
                    setError(`Connect failed: ${err?.message || err}`);
                    setStatus("error");
                    onError?.(err);
                });
        },
        [serverUrl, onConnect, onDisconnect, onError],
    );

    const handleSubmitCredentials = (e: React.FormEvent) => {
        e.preventDefault();
        if (authHandlerRef.current && credentials.username && credentials.password) {
            authHandlerRef.current.sendCredentials(credentials);
            setNeedsCredentials(false);
        }
    };

    if (status === "loading") {
        return (
            <div className="flex items-center justify-center h-full bg-gray-900 text-white">
                Loading DCV SDK...
            </div>
        );
    }

    if (status === "error") {
        return (
            <div className="flex flex-col items-center justify-center h-full bg-gray-900 text-white p-4">
                <h2 className="text-xl mb-4 text-red-400">Connection Error</h2>
                <div className="text-gray-400 mb-4 text-center max-w-lg">{error}</div>
                <button
                    onClick={() => {
                        authStartedRef.current = false;
                        window.location.reload();
                    }}
                    className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700"
                >
                    Retry
                </button>
            </div>
        );
    }

    if (needsCredentials) {
        return (
            <div className="flex flex-col items-center justify-center h-full bg-gray-900 text-white p-4">
                <h2 className="text-xl mb-4">DCV Login</h2>
                <form onSubmit={handleSubmitCredentials} className="w-full max-w-sm space-y-4">
                    <input
                        type="text"
                        placeholder="Username"
                        value={credentials.username}
                        onChange={(e) =>
                            setCredentials((c) => ({ ...c, username: e.target.value }))
                        }
                        className="w-full px-4 py-2 bg-gray-800 rounded border border-gray-700 focus:border-blue-500 outline-none"
                    />
                    <input
                        type="password"
                        placeholder="Password"
                        value={credentials.password}
                        onChange={(e) =>
                            setCredentials((c) => ({ ...c, password: e.target.value }))
                        }
                        className="w-full px-4 py-2 bg-gray-800 rounded border border-gray-700 focus:border-blue-500 outline-none"
                    />
                    <button
                        type="submit"
                        className="w-full px-4 py-2 bg-blue-600 rounded hover:bg-blue-700"
                    >
                        Connect
                    </button>
                </form>
            </div>
        );
    }

    return (
        <div className="relative w-full h-full bg-gray-900">
            {(status === "authenticating" || status === "ready-to-connect") && (
                <div className="absolute inset-0 flex items-center justify-center text-white z-10">
                    {status === "authenticating"
                        ? "Authenticating..."
                        : "Connecting to DCV session..."}
                </div>
            )}
            <div ref={containerRef} id="dcv-display" className="w-full h-full" />
        </div>
    );
}
