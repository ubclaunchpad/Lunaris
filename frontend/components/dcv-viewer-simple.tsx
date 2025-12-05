"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";

/**
 * Simple DCV Viewer Component
 *
 * Connects to an AWS DCV server using the Web Client SDK.
 * Handles authentication and session connection automatically.
 */

interface DCVSession {
    sessionId?: string;
    id?: string;
    authToken?: string;
    authenticationToken?: string;
}

interface DCVAuthenticationData {
    getAuthToken?: () => string;
    getSessionToken?: () => string;
}

interface DCVAuthHandler {
    sendCredentials: (credentials: { username: string; password: string }) => void;
}

interface DCVConnection {
    disconnect: () => void;
}

interface DCVSDK {
    setLogLevel: (level: number) => void;
    authenticate: (url: string, options: DCVAuthOptions) => DCVAuthHandler;
    connect: (options: DCVConnectOptions) => Promise<DCVConnection>;
}

interface DCVAuthOptions {
    promptCredentials: () => void;
    success: (authenticationData: DCVAuthenticationData, sessionList: DCVSession[]) => void;
    error: (error: Error) => void;
}

interface DCVConnectOptions {
    url: string;
    sessionId: string;
    authToken: string;
    divId: string;
    baseUrl: string;
    callbacks: {
        firstFrame: () => void;
        disconnect: (reason: { message?: string }) => void;
        error: (error: Error) => void;
    };
}

interface DCVViewerSimpleProps {
    serverUrl: string;
    // Credentials for DCV authentication
    username?: string;
    password?: string;
    onConnect?: () => void;
    onDisconnect?: (reason: { message?: string }) => void;
    onError?: (error: Error) => void;
}

declare global {
    interface Window {
        dcv?: DCVSDK;
    }
}

let sdkLoadPromise: Promise<DCVSDK> | null = null;

async function loadDCVSDK(): Promise<DCVSDK> {
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
    const dcvWrapperRef = useRef<HTMLDivElement>(null);
    const dcvRef = useRef<DCVSDK | null>(null);
    const authHandlerRef = useRef<DCVAuthHandler | null>(null);
    const connectionRef = useRef<DCVConnection | null>(null);
    const authStartedRef = useRef(false); // Prevent multiple auth attempts
    const mountedRef = useRef(true); // Track if component is mounted
    const currentZoomRef = useRef<number>(1); // Track current zoom level

    // Sync credentials when props change
    useEffect(() => {
        setCredentials({ username, password });
    }, [username, password]);

    // Handle window resize - calculate and apply zoom factor
    useEffect(() => {
        const calculateAndApplyZoom = () => {
            if (!containerRef.current || !dcvWrapperRef.current) return;

            // Get the canvas that DCV creates
            const canvas = dcvWrapperRef.current.querySelector("canvas");
            if (!canvas) return;

            const containerWidth = containerRef.current.clientWidth;
            const containerHeight = containerRef.current.clientHeight;
            const canvasWidth = canvas.width || 1280;
            const canvasHeight = canvas.height || 720;

            // Calculate zoom to fit while maintaining aspect ratio
            const scaleX = containerWidth / canvasWidth;
            const scaleY = containerHeight / canvasHeight;
            const zoom = Math.min(scaleX, scaleY, 1); // Don't zoom in past 100%

            // Store zoom for mouse event adjustment
            currentZoomRef.current = zoom;

            // Compute offsets to center the scaled canvas within the container
            const scaledCanvasWidth = canvasWidth * zoom;
            const scaledCanvasHeight = canvasHeight * zoom;
            const left = Math.max((containerWidth - scaledCanvasWidth) / 2, 0);
            const top = Math.max((containerHeight - scaledCanvasHeight) / 2, 0);

            // Apply CSS transform: translate then scale so the canvas is centered
            dcvWrapperRef.current.style.transformOrigin = "top left";
            dcvWrapperRef.current.style.transform = `translate(${left}px, ${top}px) scale(${zoom})`;
        };

        // Run on resize
        window.addEventListener("resize", calculateAndApplyZoom);

        // Also run periodically until canvas is found
        const interval = setInterval(() => {
            if (dcvWrapperRef.current?.querySelector("canvas")) {
                calculateAndApplyZoom();
            }
        }, 200);

        // Stop checking after 10 seconds
        const timeout = setTimeout(() => clearInterval(interval), 10000);

        return () => {
            window.removeEventListener("resize", calculateAndApplyZoom);
            clearInterval(interval);
            clearTimeout(timeout);
        };
    }, [status]);

    // Intercept mouse events to adjust coordinates for scaling
    useEffect(() => {
        if (!dcvWrapperRef.current) return;

        const wrapper = dcvWrapperRef.current;

        // Create adjusted mouse event
        const adjustMouseEvent = (e: MouseEvent): void => {
            const zoom = currentZoomRef.current;
            if (zoom === 1) return; // No adjustment needed

            // Get the canvas
            const canvas = wrapper.querySelector("canvas");
            if (!canvas) return;

            // Calculate the adjusted coordinates
            const rect = wrapper.getBoundingClientRect();
            const x = (e.clientX - rect.left) / zoom;
            const y = (e.clientY - rect.top) / zoom;

            // Override the offset properties used by DCV SDK
            Object.defineProperty(e, "offsetX", { value: x, writable: false });
            Object.defineProperty(e, "offsetY", { value: y, writable: false });
        };

        // Capture phase to adjust before DCV SDK sees the event
        const handleMouseEvent = (e: MouseEvent) => {
            adjustMouseEvent(e);
        };

        wrapper.addEventListener("mousedown", handleMouseEvent, true);
        wrapper.addEventListener("mouseup", handleMouseEvent, true);
        wrapper.addEventListener("mousemove", handleMouseEvent, true);
        wrapper.addEventListener("click", handleMouseEvent, true);

        return () => {
            wrapper.removeEventListener("mousedown", handleMouseEvent, true);
            wrapper.removeEventListener("mouseup", handleMouseEvent, true);
            wrapper.removeEventListener("mousemove", handleMouseEvent, true);
            wrapper.removeEventListener("click", handleMouseEvent, true);
        };
    }, [status]);

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
                if (credentials.username && credentials.password && authHandlerRef.current) {
                    authHandlerRef.current.sendCredentials(credentials);
                }
            },

            success: (authenticationData: DCVAuthenticationData, sessionList: DCVSession[]) => {
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
                    if (authenticationData.getAuthToken) {
                        sessionToken = authenticationData.getAuthToken();
                    } else if (authenticationData.getSessionToken) {
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

            error: (authError: Error) => {
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
        (dcv: DCVSDK, sessionId: string, token: string) => {
            if (!dcvWrapperRef.current) {
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
                divId: dcvWrapperRef.current.id,
                baseUrl: sdkBaseUrl,
                callbacks: {
                    firstFrame: () => {
                        setStatus("connected");
                        onConnect?.();
                    },
                    disconnect: (reason: { message?: string }) => {
                        setStatus("error");
                        setError(`Disconnected: ${reason?.message || JSON.stringify(reason)}`);
                        onDisconnect?.(reason);
                    },
                    error: (err: Error) => {
                        console.error("DCV connection error:", err);
                        setError(`Connection error: ${err?.message || JSON.stringify(err)}`);
                        setStatus("error");
                        onError?.(err);
                    },
                },
            })
                .then((connection: DCVConnection) => {
                    connectionRef.current = connection;
                })
                .catch((err: Error) => {
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
        <div
            ref={containerRef}
            className="relative w-full h-full bg-gray-900 overflow-hidden dcv-container"
        >
            {(status === "authenticating" || status === "ready-to-connect") && (
                <div className="absolute inset-0 flex items-center justify-center text-white z-10">
                    {status === "authenticating"
                        ? "Authenticating..."
                        : "Connecting to DCV session..."}
                </div>
            )}
            <div ref={dcvWrapperRef} id="dcv-display" className="dcv-display-wrapper" />
            {/* CSS - container for zoom calculation */}
            <style>{`
                .dcv-container {
                    position: relative;
                    width: 100%;
                    height: 100%;
                    overflow: hidden;
                }
                .dcv-display-wrapper {
                    transform-origin: top left;
                }
            `}</style>
        </div>
    );
}
