"use client";

import { use, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ChevronLeft, Gamepad2, Keyboard } from "lucide-react";
import gamesData from "@/lib/data.json";
import {
    apiClient,
    type GetDeploymentStatusResponse,
    type DeploymentStatus,
} from "@/lib/api-client";
import { useDeploymentStatus } from "@/lib/hooks/useDeploymentStatus";

interface GamePageProps {
    params: Promise<{
        id: string;
    }>;
}

export default function GamePage({ params }: GamePageProps) {
    const router = useRouter();
    const { id } = use(params);
    const game = gamesData.games.find((g) => g.id === id);

    const [userId, setUserId] = useState("test123"); // TODO: Get from auth context
    const [isDeploying, setIsDeploying] = useState(false);
    const [deploymentStatus, setDeploymentStatus] = useState<string>("");
    const [lastLoggedStep, setLastLoggedStep] = useState<string | null>(null);

    // Handle deployment status changes
    const handleStatusChange = useCallback(
        (status: DeploymentStatus, response: GetDeploymentStatusResponse) => {
            if (status === "RUNNING") {
                const stepKey = `${response.currentStep}-${response.stepNumber}`;
                if (stepKey !== lastLoggedStep) {
                    const stepInfo =
                        response.stepNumber && response.totalSteps
                            ? `Step ${response.stepNumber}/${response.totalSteps}`
                            : "";
                    const statusText = response.currentStepName || response.message;
                    setDeploymentStatus(`${stepInfo} ${statusText}`.trim());
                    setLastLoggedStep(stepKey);
                }
            } else if (status === "NOT_FOUND") {
                if (lastLoggedStep !== "NOT_FOUND") {
                    setDeploymentStatus("Initializing deployment...");
                    setLastLoggedStep("NOT_FOUND");
                }
            } else if (status === "FAILED") {
                const errorInfo = response.errorStep
                    ? ` at step "${response.failedAt || response.errorStep}"`
                    : "";
                setDeploymentStatus(`Deployment failed${errorInfo}: ${response.message}`);
            }
        },
        [lastLoggedStep],
    );

    // Handle deployment success - poll for streaming credentials
    const handleDeploymentSuccess = useCallback(
        async (response: GetDeploymentStatusResponse) => {
            setDeploymentStatus("Instance ready! Getting credentials...");

            try {
                // Poll for streaming credentials
                let retries = 0;
                const maxRetries = 30; // 30 retries = ~1 minute with 2 second intervals

                while (retries < maxRetries) {
                    try {
                        const streamData = await apiClient.getStreamingLink({ userId });
                        const session = streamData as {
                            streamingLink?: string;
                            dcvUser?: string;
                            dcvPassword?: string;
                        };

                        if (session.streamingLink && session.dcvUser && session.dcvPassword) {
                            // Credentials ready, redirect to streaming page
                            const params = new URLSearchParams({
                                serverUrl: session.streamingLink,
                                username: session.dcvUser,
                                password: session.dcvPassword,
                                gameId: id,
                                gameName: game?.name || "",
                            });

                            router.push(`/streaming?${params.toString()}`);
                            return;
                        }
                    } catch (error) {
                        // Credentials not ready yet, continue polling
                    }

                    retries++;
                    setDeploymentStatus(`Getting credentials... (${retries}/${maxRetries})`);
                    await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
                }

                // Timeout
                setDeploymentStatus("Failed to get credentials. Please try again.");
                setIsDeploying(false);
            } catch (error) {
                setDeploymentStatus(
                    `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
                );
                setIsDeploying(false);
            }
        },
        [userId, id, game?.name, router],
    );

    // Handle deployment error
    const handleDeploymentError = useCallback((error: Error) => {
        setDeploymentStatus(`Deployment failed: ${error.message}`);
        setIsDeploying(false);
    }, []);

    // Set up deployment status polling
    const { startPolling, stopPolling } = useDeploymentStatus({
        userId,
        pollInterval: 5000,
        onStatusChange: handleStatusChange,
        onSuccess: handleDeploymentSuccess,
        onError: handleDeploymentError,
    });

    // Handle Play button click
    const handlePlayClick = async () => {
        if (!game?.playable) return;

        setIsDeploying(true);
        setDeploymentStatus("Starting deployment...");
        setLastLoggedStep(null);

        try {
            const response = await apiClient.deployInstance({ userId });
            setDeploymentStatus(`Deployment started: ${response.message}`);

            // Start polling for deployment status
            startPolling();
        } catch (error) {
            setDeploymentStatus(
                `Deploy error: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
            setIsDeploying(false);
        }
    };

    if (!game) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-white text-2xl">Game not found</div>
            </div>
        );
    }

    return (
        <div>
            <button
                onClick={() => router.back()}
                className="flex items-center gap-2 mb-6 text-white hover:text-[#e1ff9a] transition-colors"
            >
                <ChevronLeft className="w-6 h-6" />
                <span className="font-space-grotesk text-xl">Back</span>
            </button>

            {/* Game Header Section */}
            <div className="flex gap-12 mb-16">
                {/* Game Cover Image */}
                <div className="w-[489px] h-[321px] rounded-[10px] overflow-hidden shadow-[8px_7px_20px_0px_rgba(0,0,0,0.12)] shrink-0 relative">
                    <Image src={game.image} alt={game.name} fill className="object-cover" />
                </div>

                {/* Game Info */}
                <div className="flex-1 pt-2">
                    <h1 className="font-space-grotesk font-bold text-white text-[36px] leading-[1.24] mb-8">
                        {game.name}
                    </h1>

                    <p className="font-space-grotesk text-[#fbfff5] text-[14px] leading-[1.5] mb-8">
                        {game.description || "No description available."}
                    </p>

                    {/* Tags */}
                    <div className="flex gap-4 flex-wrap">
                        {game.tags.map((tag, idx) => (
                            <div
                                key={idx}
                                className="border border-[#e6daf6] text-[#e6daf6] px-4 py-2 rounded-sm font-space-grotesk text-base shadow-[8px_7px_20px_0px_rgba(0,0,0,0.12)]"
                            >
                                {tag}
                            </div>
                        ))}
                        {game.modes.map((mode, idx) => (
                            <div
                                key={idx}
                                className="border border-[#e6daf6] text-[#e6daf6] px-4 py-2 rounded-lg font-space-grotesk text-base shadow-[8px_7px_20px_0px_rgba(0,0,0,0.12)]"
                            >
                                {mode}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Play Button */}
            <div className="mb-12">
                <button
                    onClick={handlePlayClick}
                    disabled={!game.playable || isDeploying}
                    className={`border border-[#e6daf6] font-space-grotesk font-medium text-xl px-5 py-3 rounded-xl shadow-[8px_7px_20px_0px_rgba(0,0,0,0.12)] transition-colors ${
                        game.playable && !isDeploying
                            ? "bg-[#e1ff9a] text-[#12191d] hover:bg-[#d1ef8a] cursor-pointer"
                            : "bg-gray-500 text-gray-300 cursor-not-allowed opacity-50"
                    }`}
                >
                    {isDeploying ? (
                        <span className="flex items-center gap-2">
                            <div className="animate-spin h-5 w-5 border-2 border-gray-300 border-t-transparent rounded-full"></div>
                            Deploying...
                        </span>
                    ) : game.playable ? (
                        "Play"
                    ) : (
                        "Not Available"
                    )}
                </button>

                {/* Deployment Status */}
                {isDeploying && deploymentStatus && (
                    <div className="mt-4 bg-blue-900/50 border border-blue-700 rounded-lg p-4">
                        <div className="flex items-center gap-2">
                            <div className="animate-spin h-4 w-4 border-2 border-blue-400 border-t-transparent rounded-full"></div>
                            <span className="text-blue-300 text-sm">{deploymentStatus}</span>
                        </div>
                        <p className="text-xs text-blue-400 mt-2">
                            This may take 2-3 minutes. You'll be automatically redirected when
                            ready.
                        </p>
                    </div>
                )}
            </div>

            {/* Game Details */}
            <div className="grid grid-cols-2 gap-16 mb-16">
                <div className="font-space-grotesk text-[#fbfff5] text-base space-y-2">
                    <p>
                        <span className="font-bold">Publisher:</span> Electronic Arts
                    </p>
                    <p>
                        <span className="font-bold">Developer:</span> Hazelight Studios
                    </p>
                    <p>
                        <span className="font-bold">Rating:</span> T
                    </p>
                    <p>
                        <span className="font-bold">Release Date:</span> March 25, 2021
                    </p>
                </div>
                <div className="font-space-grotesk text-[#fbfff5] text-base space-y-2">
                    <p>
                        <span className="font-bold">Warnings:</span> Blood, Mild Language
                    </p>
                    <p>
                        <span className="font-bold">Languages:</span> English, French
                    </p>
                    <p className="font-bold">Minimum System Requirements:</p>
                    <p className="flex items-center gap-2">
                        <span className="font-bold">Input:</span>
                        <Gamepad2 className="w-5 h-5 text-[#e6daf6]" />
                        <Keyboard className="w-5 h-5 text-[#e6daf6]" />
                    </p>
                </div>
            </div>
        </div>
    );
}
