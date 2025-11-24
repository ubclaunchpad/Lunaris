import { Duration } from "aws-cdk-lib";
import { WorkflowConfig, LambdaFunctionRef, RetryConfig, ErrorHandlingConfig } from "./types";

/**
 * Utility functions for creating and validating Step Functions workflow configurations
 */

/**
 * Creates a basic sequential workflow configuration
 * @param name Unique name for the workflow
 * @param description Human-readable description
 * @param lambdaFunctions Array of Lambda function names in execution order
 * @param options Optional configuration options
 * @returns WorkflowConfig for a sequential workflow
 */
export function createSequentialWorkflow(
    name: string,
    description: string,
    lambdaFunctions: string[],
    options: {
        timeout?: Duration;
        retryConfig?: RetryConfig;
        errorHandling?: ErrorHandlingConfig;
        definitionPath?: string;
    } = {},
): WorkflowConfig {
    const lambdaFunctionRefs: Record<string, LambdaFunctionRef> = {};

    lambdaFunctions.forEach((functionName, index) => {
        const key = `step${index + 1}`;
        lambdaFunctionRefs[key] = createLambdaFunctionRef(
            functionName,
            `\${${toPascalCase(functionName)}Arn}`,
            true,
        );
    });

    return {
        name,
        description,
        definitionPath: options.definitionPath || `${toKebabCase(name)}/definition.asl.json`,
        lambdaFunctions: lambdaFunctionRefs,
        timeout: options.timeout,
        retryConfig: options.retryConfig,
        errorHandling: options.errorHandling,
    };
}

/**
 * Creates a parallel workflow configuration
 * @param name Unique name for the workflow
 * @param description Human-readable description
 * @param parallelBranches Object mapping branch names to Lambda function names
 * @param options Optional configuration options
 * @returns WorkflowConfig for a parallel workflow
 */
export function createParallelWorkflow(
    name: string,
    description: string,
    parallelBranches: Record<string, string[]>,
    options: {
        timeout?: Duration;
        retryConfig?: RetryConfig;
        errorHandling?: ErrorHandlingConfig;
        definitionPath?: string;
    } = {},
): WorkflowConfig {
    const lambdaFunctionRefs: Record<string, LambdaFunctionRef> = {};

    Object.entries(parallelBranches).forEach(([branchName, functionNames]) => {
        functionNames.forEach((functionName, index) => {
            const key = `${branchName}Step${index + 1}`;
            lambdaFunctionRefs[key] = createLambdaFunctionRef(
                functionName,
                `\${${toPascalCase(functionName)}Arn}`,
                true,
            );
        });
    });

    return {
        name,
        description,
        definitionPath: options.definitionPath || `${toKebabCase(name)}/definition.asl.json`,
        lambdaFunctions: lambdaFunctionRefs,
        timeout: options.timeout,
        retryConfig: options.retryConfig,
        errorHandling: options.errorHandling,
    };
}

/**
 * Creates a choice-based workflow configuration
 * @param name Unique name for the workflow
 * @param description Human-readable description
 * @param decisionFunction Lambda function that makes the choice decision
 * @param branches Object mapping choice outcomes to Lambda function arrays
 * @param options Optional configuration options
 * @returns WorkflowConfig for a choice workflow
 */
export function createChoiceWorkflow(
    name: string,
    description: string,
    decisionFunction: string,
    branches: Record<string, string[]>,
    options: {
        timeout?: Duration;
        retryConfig?: RetryConfig;
        errorHandling?: ErrorHandlingConfig;
        definitionPath?: string;
        defaultBranch?: string;
    } = {},
): WorkflowConfig {
    const lambdaFunctionRefs: Record<string, LambdaFunctionRef> = {};

    // Add decision function
    lambdaFunctionRefs.decision = createLambdaFunctionRef(
        decisionFunction,
        `\${${toPascalCase(decisionFunction)}Arn}`,
        true,
    );

    // Add branch functions
    Object.entries(branches).forEach(([branchName, functionNames]) => {
        functionNames.forEach((functionName, index) => {
            const key = `${branchName}Step${index + 1}`;
            lambdaFunctionRefs[key] = createLambdaFunctionRef(
                functionName,
                `\${${toPascalCase(functionName)}Arn}`,
                true,
            );
        });
    });

    return {
        name,
        description,
        definitionPath: options.definitionPath || `${toKebabCase(name)}/definition.asl.json`,
        lambdaFunctions: lambdaFunctionRefs,
        timeout: options.timeout,
        retryConfig: options.retryConfig,
        errorHandling: options.errorHandling,
    };
}

/**
 * Helper function to create a Lambda function reference
 * @param functionName The name of the Lambda function
 * @param placeholder The placeholder string in the ASL definition
 * @param required Whether this function is required
 * @returns LambdaFunctionRef object
 */
export function createLambdaFunctionRef(
    functionName: string,
    placeholder: string,
    required: boolean = true,
): LambdaFunctionRef {
    return {
        functionName,
        placeholder,
        required,
    };
}

/**
 * Creates a standard retry configuration with exponential backoff
 * @param maxAttempts Maximum number of retry attempts (default: 3)
 * @param backoffRate Multiplier for retry interval (default: 2.0)
 * @param intervalSeconds Initial retry interval in seconds (default: 2)
 * @returns RetryConfig object
 */
export function createRetryConfig(
    maxAttempts: number = 3,
    backoffRate: number = 2.0,
    intervalSeconds: number = 2,
): RetryConfig {
    validateRetryParameters(maxAttempts, backoffRate, intervalSeconds);

    return {
        maxAttempts,
        backoffRate,
        intervalSeconds,
    };
}

/**
 * Creates a standard error handling configuration
 * @param catchAll Whether to catch all unhandled errors (default: true)
 * @param customErrorStates Optional mapping of error types to custom states
 * @returns ErrorHandlingConfig object
 */
export function createErrorHandlingConfig(
    catchAll: boolean = true,
    customErrorStates?: Record<string, string>,
): ErrorHandlingConfig {
    return {
        catchAll,
        customErrorStates,
    };
}

/**
 * Creates error handling configuration for common AWS service errors
 * @param includeServiceErrors Whether to include common AWS service error mappings
 * @returns ErrorHandlingConfig with common error mappings
 */
export function createStandardErrorHandling(
    includeServiceErrors: boolean = true,
): ErrorHandlingConfig {
    const customErrorStates: Record<string, string> = {};

    if (includeServiceErrors) {
        // Common AWS service errors
        customErrorStates["States.TaskFailed"] = "HandleTaskFailure";
        customErrorStates["States.Timeout"] = "HandleTimeout";
        customErrorStates["Lambda.ServiceException"] = "HandleLambdaServiceError";
        customErrorStates["Lambda.AWSLambdaException"] = "HandleLambdaError";
        customErrorStates["DynamoDB.ServiceException"] = "HandleDynamoDBError";
        customErrorStates["S3.ServiceException"] = "HandleS3Error";
    }

    return createErrorHandlingConfig(true, customErrorStates);
}

/**
 * Validates a workflow configuration object
 * @param config The workflow configuration to validate
 * @throws Error if validation fails
 */
export function validateWorkflowConfig(config: WorkflowConfig): void {
    // Validate required fields
    if (!config.name || typeof config.name !== "string" || config.name.trim() === "") {
        throw new Error("Workflow configuration must have a non-empty name");
    }

    if (
        !config.description ||
        typeof config.description !== "string" ||
        config.description.trim() === ""
    ) {
        throw new Error(`Workflow '${config.name}' must have a non-empty description`);
    }

    if (
        !config.definitionPath ||
        typeof config.definitionPath !== "string" ||
        config.definitionPath.trim() === ""
    ) {
        throw new Error(`Workflow '${config.name}' must have a non-empty definitionPath`);
    }

    // Validate Lambda functions
    if (!config.lambdaFunctions || typeof config.lambdaFunctions !== "object") {
        throw new Error(`Workflow '${config.name}' must have lambdaFunctions object`);
    }

    // Validate each Lambda function reference
    Object.entries(config.lambdaFunctions).forEach(([key, ref]) => {
        validateLambdaFunctionRef(config.name, key, ref);
    });

    // Validate optional configurations
    if (config.retryConfig) {
        validateRetryConfigObject(config.name, config.retryConfig);
    }

    if (config.errorHandling) {
        validateErrorHandlingConfig(config.name, config.errorHandling);
    }

    if (config.timeout && (!config.timeout || typeof config.timeout.toSeconds !== "function")) {
        throw new Error(`Workflow '${config.name}' timeout must be a valid Duration object`);
    }
}

/**
 * Validates a Lambda function reference
 * @param workflowName Name of the workflow for error messages
 * @param key The key of the Lambda function reference
 * @param ref The Lambda function reference to validate
 * @throws Error if validation fails
 */
export function validateLambdaFunctionRef(
    workflowName: string,
    key: string,
    ref: LambdaFunctionRef,
): void {
    if (!ref || typeof ref !== "object") {
        throw new Error(
            `Workflow '${workflowName}' Lambda function reference '${key}' must be an object`,
        );
    }

    if (
        !ref.functionName ||
        typeof ref.functionName !== "string" ||
        ref.functionName.trim() === ""
    ) {
        throw new Error(
            `Workflow '${workflowName}' Lambda function reference '${key}' must have a non-empty functionName`,
        );
    }

    if (!ref.placeholder || typeof ref.placeholder !== "string" || ref.placeholder.trim() === "") {
        throw new Error(
            `Workflow '${workflowName}' Lambda function reference '${key}' must have a non-empty placeholder`,
        );
    }

    if (typeof ref.required !== "boolean") {
        throw new Error(
            `Workflow '${workflowName}' Lambda function reference '${key}' required field must be a boolean`,
        );
    }
}

/**
 * Validates retry configuration parameters
 * @param workflowName Name of the workflow for error messages
 * @param retryConfig Retry configuration to validate
 * @throws Error if validation fails
 */
export function validateRetryConfigObject(workflowName: string, retryConfig: RetryConfig): void {
    if (!retryConfig || typeof retryConfig !== "object") {
        throw new Error(`Workflow '${workflowName}' retryConfig must be an object`);
    }

    validateRetryParameters(
        retryConfig.maxAttempts,
        retryConfig.backoffRate,
        retryConfig.intervalSeconds,
        workflowName,
    );
}

/**
 * Validates error handling configuration
 * @param workflowName Name of the workflow for error messages
 * @param errorHandling Error handling configuration to validate
 * @throws Error if validation fails
 */
export function validateErrorHandlingConfig(
    workflowName: string,
    errorHandling: ErrorHandlingConfig,
): void {
    if (!errorHandling || typeof errorHandling !== "object") {
        throw new Error(`Workflow '${workflowName}' errorHandling must be an object`);
    }

    if (typeof errorHandling.catchAll !== "boolean") {
        throw new Error(`Workflow '${workflowName}' errorHandling.catchAll must be a boolean`);
    }

    if (errorHandling.customErrorStates) {
        if (typeof errorHandling.customErrorStates !== "object") {
            throw new Error(
                `Workflow '${workflowName}' errorHandling.customErrorStates must be an object`,
            );
        }

        Object.entries(errorHandling.customErrorStates).forEach(([errorType, stateName]) => {
            if (typeof errorType !== "string" || errorType.trim() === "") {
                throw new Error(
                    `Workflow '${workflowName}' errorHandling.customErrorStates keys must be non-empty strings`,
                );
            }
            if (typeof stateName !== "string" || stateName.trim() === "") {
                throw new Error(
                    `Workflow '${workflowName}' errorHandling.customErrorStates values must be non-empty strings`,
                );
            }
        });
    }
}

/**
 * Validates retry parameters
 * @param maxAttempts Maximum number of retry attempts
 * @param backoffRate Multiplier for retry interval
 * @param intervalSeconds Initial retry interval in seconds
 * @param workflowName Optional workflow name for error messages
 * @throws Error if validation fails
 */
function validateRetryParameters(
    maxAttempts: number,
    backoffRate: number,
    intervalSeconds: number,
    workflowName?: string,
): void {
    const prefix = workflowName ? `Workflow '${workflowName}' ` : "";

    if (!Number.isInteger(maxAttempts) || maxAttempts <= 0) {
        throw new Error(`${prefix}retry config maxAttempts must be a positive integer`);
    }

    if (typeof backoffRate !== "number" || backoffRate <= 0) {
        throw new Error(`${prefix}retry config backoffRate must be a positive number`);
    }

    if (!Number.isInteger(intervalSeconds) || intervalSeconds <= 0) {
        throw new Error(`${prefix}retry config intervalSeconds must be a positive integer`);
    }
}

/**
 * Converts a string to PascalCase
 * @param str String to convert
 * @returns PascalCase string
 */
function toPascalCase(str: string): string {
    return str
        .replace(/[-_\s]+(.)?/g, (_, char) => (char ? char.toUpperCase() : ""))
        .replace(/^(.)/, (_, char) => char.toUpperCase());
}

/**
 * Converts a string to kebab-case
 * @param str String to convert
 * @returns kebab-case string
 */
function toKebabCase(str: string): string {
    return str
        .replace(/([a-z])([A-Z])/g, "$1-$2")
        .replace(/[\s_]+/g, "-")
        .toLowerCase();
}

/**
 * Batch validates multiple workflow configurations
 * @param configs Array of workflow configurations to validate
 * @returns Array of validation results with errors if any
 */
export function validateWorkflowConfigs(configs: WorkflowConfig[]): Array<{
    config: WorkflowConfig;
    isValid: boolean;
    error?: string;
}> {
    return configs.map((config) => {
        try {
            validateWorkflowConfig(config);
            return { config, isValid: true };
        } catch (error) {
            return {
                config,
                isValid: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    });
}

/**
 * Creates a workflow configuration with sensible defaults
 * @param name Unique name for the workflow
 * @param description Human-readable description
 * @param lambdaFunctions Map of Lambda function references
 * @param options Optional configuration overrides
 * @returns Complete WorkflowConfig with defaults applied
 */
export function createWorkflowWithDefaults(
    name: string,
    description: string,
    lambdaFunctions: Record<string, LambdaFunctionRef>,
    options: {
        timeout?: Duration;
        retryConfig?: RetryConfig;
        errorHandling?: ErrorHandlingConfig;
        definitionPath?: string;
    } = {},
): WorkflowConfig {
    return {
        name,
        description,
        definitionPath: options.definitionPath || `${toKebabCase(name)}/definition.asl.json`,
        lambdaFunctions,
        timeout: options.timeout || Duration.minutes(15),
        retryConfig: options.retryConfig || createRetryConfig(),
        errorHandling: options.errorHandling || createStandardErrorHandling(),
    };
}
