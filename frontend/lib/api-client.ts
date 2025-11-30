export interface DeployInstanceRequest {
    userId: string;
}

export interface DeployInstanceResponse {
    message: string;
    status?: string;
    statusCode?: number;
}

export interface TerminateInstanceRequest {
    userId: string;
    instanceId: string;
}

export interface TerminateInstanceResponse {
    message: string;
    status?: string;
}

export interface GetStreamingLinkRequest {
    userId: string;
}

export interface GetStreamingLinkResponse {
    userId?: string;
    message: string;
    error?: string;
    [key: string]: unknown;
}

export interface GetDeploymentStatusRequest {
    userId: string;
}

export type DeploymentStatus = "RUNNING" | "SUCCEEDED" | "FAILED" | "NOT_FOUND" | "UNKNOWN";

export interface GetDeploymentStatusResponse {
    status: DeploymentStatus;
    deploymentStatus?: "deploying" | "running";
    message: string;
    instanceId?: string;
    dcvUrl?: string;
    error?: string;
}

export class ApiError extends Error {
    constructor(
        public statusCode: number,
        message: string,
        public error?: string,
    ) {
        super(message);
        this.name = "ApiError";
    }
}

export class NetworkError extends Error {
    constructor(
        message: string,
        public originalError?: unknown,
    ) {
        super(message);
        this.name = "NetworkError";
    }
}

class ApiClient {
    private baseUrl: string;
    private isDevelopment: boolean;

    constructor() {
        this.baseUrl =
            process.env.NEXT_PUBLIC_API_GATEWAY_URL || 
            process.env.NEXT_PUBLIC_API_URL || 
            "https://snmonwfes7.execute-api.us-west-2.amazonaws.com/prod";
        this.isDevelopment = process.env.NODE_ENV === "development";

        if (!this.baseUrl) {
            console.warn(
                "API Gateway URL not configured. Set NEXT_PUBLIC_API_GATEWAY_URL environment variable.",
            );
        }
    }

    private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;
        const requestOptions: RequestInit = {
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...options.headers,
            },
        };

        if (this.isDevelopment) {
            console.log(`[API Client] ${options.method || "GET"} ${url}`, {
                body: options.body,
            });
        }

        try {
            const response = await fetch(url, requestOptions);

            if (this.isDevelopment) {
                console.log(`[API Client] Response:`, {
                    status: response.status,
                    statusText: response.statusText,
                });
            }

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                const errorMessage =
                    data.message || data.error || `HTTP ${response.status}: ${response.statusText}`;
                throw new ApiError(response.status, errorMessage, data.error);
            }

            if (this.isDevelopment) {
                console.log(`[API Client] Response data:`, data);
            }

            return data as T;
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }

            if (error instanceof TypeError && error.message.includes("fetch")) {
                throw new NetworkError(
                    "Network request failed. Please check your connection.",
                    error,
                );
            }

            throw new NetworkError(
                error instanceof Error ? error.message : "Unknown error occurred",
                error,
            );
        }
    }

    async deployInstance(request: DeployInstanceRequest): Promise<DeployInstanceResponse> {
        return this.request<DeployInstanceResponse>("/deployInstance", {
            method: "POST",
            body: JSON.stringify(request),
        });
    }

    async terminateInstance(request: TerminateInstanceRequest): Promise<TerminateInstanceResponse> {
        return this.request<TerminateInstanceResponse>("/terminateInstance", {
            method: "POST",
            body: JSON.stringify(request),
        });
    }

    async getStreamingLink(request: GetStreamingLinkRequest): Promise<GetStreamingLinkResponse> {
        const params = new URLSearchParams({ userId: request.userId });
        return this.request<GetStreamingLinkResponse>(`/streamingLink?${params.toString()}`, {
            method: "GET",
        });
    }

    async getDeploymentStatus(
        request: GetDeploymentStatusRequest,
    ): Promise<GetDeploymentStatusResponse> {
        const params = new URLSearchParams({ userId: request.userId });
        return this.request<GetDeploymentStatusResponse>(
            `/deployment-status?${params.toString()}`,
            {
                method: "GET",
            },
        );
    }
}

export const apiClient = new ApiClient();

export default apiClient;
