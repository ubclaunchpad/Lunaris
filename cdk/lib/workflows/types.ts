import { Duration } from "aws-cdk-lib";

/**
 * Configuration for a Lambda function reference within a workflow
 */
export interface LambdaFunctionRef {
    /** The name of the Lambda function as it appears in the props */
    functionName: string;
    /** The placeholder string in the ASL definition to be replaced with the function ARN */
    placeholder: string;
    /** Whether this Lambda function is required for the workflow to function */
    required: boolean;
}

/**
 * Retry configuration for workflow error handling
 */
export interface RetryConfig {
    /** Maximum number of retry attempts */
    maxAttempts: number;
    /** Multiplier for the retry interval on each attempt */
    backoffRate: number;
    /** Initial retry interval in seconds */
    intervalSeconds: number;
}

/**
 * Error handling configuration for workflows
 */
export interface ErrorHandlingConfig {
    /** Whether to catch all unhandled errors */
    catchAll: boolean;
    /** Custom error state mappings for specific error types */
    customErrorStates?: Record<string, string>;
}

/**
 * Complete configuration for a Step Functions workflow
 */
export interface WorkflowConfig {
    /** Unique name for the workflow */
    name: string;
    /** Human-readable description of the workflow */
    description: string;
    /** Relative path to the ASL definition file from the stepfunctions directory */
    definitionPath: string;
    /** Map of Lambda function references used in this workflow */
    lambdaFunctions: Record<string, LambdaFunctionRef>;
    /** Optional timeout for the entire workflow execution */
    timeout?: Duration;
    /** Optional retry configuration for the workflow */
    retryConfig?: RetryConfig;
    /** Optional error handling configuration */
    errorHandling?: ErrorHandlingConfig;
}
