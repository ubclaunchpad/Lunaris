"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client";

export default function StreamingPage() {
    const [isDeploying, setIsDeploying] = useState(false);
    const [isGettingLink, setIsGettingLink] = useState(false);
    const [message, setMessage] = useState("");

    const handleDeploy = async () => {
        setIsDeploying(true);
        setMessage("");

        try {
            const response = await apiClient.deployInstance({
                userId: "test123"
            });
            setMessage(`Success: ${response.message}`);
        } catch (error) {
            setMessage(`Error: ${error instanceof Error ? error.message : "Failed to deploy"}`);
        } finally {
            setIsDeploying(false);
        }
    };

    const handleGetStreamingLink = async () => {
        setIsGettingLink(true);
        setMessage("");

        try {
            const response = await apiClient.getStreamingLink({
                userId: "test123"
            });
            setMessage(`Success: ${response.message} ${JSON.stringify(response, null, 2)}`);
        } catch (error) {
            setMessage(`Error: ${error instanceof Error ? error.message : "Failed to get streaming link"}`);
        } finally {
            setIsGettingLink(false);
        }
    };

    return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
            <div className="flex gap-4">
                <Button onClick={handleDeploy} disabled={isDeploying}>
                    {isDeploying ? "Deploying..." : "Deploy"}
                </Button>
                <Button onClick={handleGetStreamingLink} disabled={isGettingLink}>
                    {isGettingLink ? "Getting Link..." : "Get Streaming Link"}
                </Button>
            </div>
            {message && (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{message}</p>
            )}
        </div>
    );
}