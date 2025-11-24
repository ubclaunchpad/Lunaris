import { Construct } from "constructs";
import {
    StateMachine,
    DefinitionBody,
    type StateMachineProps,
} from "aws-cdk-lib/aws-stepfunctions";
import { Function } from "aws-cdk-lib/aws-lambda";
import type { WorkflowConfig, RetryConfig } from "../workflows/types";
import * as fs from "fs";
import * as path from "path";

/**
 * Factory class for creating Step Functions workflows from configuration
 */
export class WorkflowFactory extends Construct {
    constructor(scope: Construct, id: string) {
        super(scope, id);
    }

    /**
     * Creates a Step Functions workflow from configuration
     * @param config The workflow configuration
     * @param lambdaFunctions Map of available Lambda functions
     * @returns The created StateMachine
     */
    public createWorkflow(
        config: WorkflowConfig,
        lambdaFunctions: Record<string, Function>,
    ): StateMachine {
        // Validate configuration
        this.validateConfig(config, lambdaFunctions);

        // Load and process definition
        const definitionBody = this.processDefinition(config, lambdaFunctions);

        // Create state machine
        const stateMachineProps: StateMachineProps = {
            definitionBody: DefinitionBody.fromString(definitionBody),
            comment: config?.description,
            timeout: config?.timeout,
        };

        const stateMachine = new StateMachine(this, config.name, stateMachineProps);

        // Grant permissions
        this.grantPermissions(config, lambdaFunctions, stateMachine);

        return stateMachine;
    }

    /**
     * Validates workflow configuration against available Lambda functions
     * @param config The workflow configuration to validate
     * @param lambdaFunctions Available Lambda functions
     * @throws Error if validation fails
     */
    private validateConfig(
        config: WorkflowConfig,
        lambdaFunctions: Record<string, Function>,
    ): void {
        // Validate required fields
        if (!config.name) {
            throw new Error("Workflow configuration must have a name");
        }

        if (!config.description) {
            throw new Error(`Workflow '${config.name}' must have a description`);
        }

        if (!config.definitionPath) {
            throw new Error(`Workflow '${config.name}' must have a definitionPath`);
        }

        // Validate definition file exists
        const definitionPath = this.getDefinitionPath(config.definitionPath);
        if (!fs.existsSync(definitionPath)) {
            throw new Error(
                `Definition file not found for workflow '${config.name}' at path: ${definitionPath}`,
            );
        }

        // Validate all required Lambda functions exist
        Object.entries(config.lambdaFunctions).forEach(([_, ref]) => {
            if (ref.required && !lambdaFunctions[ref.functionName]) {
                throw new Error(
                    `Required Lambda function '${ref.functionName}' not found for workflow '${config.name}'`,
                );
            }
        });

        // Validate retry configuration if present
        if (config.retryConfig) {
            this.validateRetryConfig(config.name, config.retryConfig);
        }
    }

    /**
     * Validates retry configuration parameters
     * @param workflowName Name of the workflow for error messages
     * @param retryConfig Retry configuration to validate
     * @throws Error if validation fails
     */
    private validateRetryConfig(workflowName: string, retryConfig: RetryConfig): void {
        if (retryConfig.maxAttempts <= 0) {
            throw new Error(
                `Workflow '${workflowName}' retry config maxAttempts must be greater than 0`,
            );
        }

        if (retryConfig.backoffRate <= 0) {
            throw new Error(
                `Workflow '${workflowName}' retry config backoffRate must be greater than 0`,
            );
        }

        if (retryConfig.intervalSeconds <= 0) {
            throw new Error(
                `Workflow '${workflowName}' retry config intervalSeconds must be greater than 0`,
            );
        }
    }

    /**
     * Processes the workflow definition by applying template substitutions
     * @param config The workflow configuration
     * @param lambdaFunctions Available Lambda functions
     * @returns The processed definition as a string
     */
    private processDefinition(
        config: WorkflowConfig,
        lambdaFunctions: Record<string, Function>,
    ): string {
        const definitionPath = this.getDefinitionPath(config.definitionPath);

        try {
            let template = fs.readFileSync(definitionPath, "utf8");

            // Validate JSON syntax
            try {
                JSON.parse(template);
            } catch (jsonError) {
                throw new Error(
                    `Invalid JSON in definition file for workflow '${config.name}': ${jsonError}`,
                );
            }

            // Apply substitutions
            Object.entries(config.lambdaFunctions).forEach(([_, ref]) => {
                const lambdaFunction = lambdaFunctions[ref.functionName];
                if (lambdaFunction) {
                    template = template.replace(
                        new RegExp(this.escapeRegex(ref.placeholder), "g"),
                        lambdaFunction.functionArn,
                    );
                }
            });

            // Validate that all placeholders were replaced
            this.validatePlaceholderSubstitution(config, template);

            return template;
        } catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            throw new Error(`Failed to process definition for workflow '${config.name}': ${error}`);
        }
    }

    /**
     * Validates that all required placeholders were substituted
     * @param config The workflow configuration
     * @param processedTemplate The processed template
     * @throws Error if required placeholders remain
     */
    private validatePlaceholderSubstitution(
        config: WorkflowConfig,
        processedTemplate: string,
    ): void {
        Object.entries(config.lambdaFunctions).forEach(([_, ref]) => {
            if (ref.required && processedTemplate.includes(ref.placeholder)) {
                throw new Error(
                    `Required placeholder '${ref.placeholder}' was not substituted in workflow '${config.name}'. ` +
                        `Check that Lambda function '${ref.functionName}' is provided.`,
                );
            }
        });
    }

    /**
     * Grants invoke permissions from Lambda functions to the state machine
     * @param config The workflow configuration
     * @param lambdaFunctions Available Lambda functions
     * @param stateMachine The created state machine
     */
    private grantPermissions(
        config: WorkflowConfig,
        lambdaFunctions: Record<string, Function>,
        stateMachine: StateMachine,
    ): void {
        Object.entries(config.lambdaFunctions).forEach(([_, ref]) => {
            const lambdaFunction = lambdaFunctions[ref.functionName];
            if (lambdaFunction) {
                lambdaFunction.grantInvoke(stateMachine);
            }
        });
    }

    /**
     * Constructs the full path to a workflow definition file
     * @param relativePath Relative path from the stepfunctions directory
     * @returns Full path to the definition file
     */
    private getDefinitionPath(relativePath: string): string {
        return path.join(__dirname, "../../stepfunctions", relativePath);
    }

    /**
     * Escapes special regex characters in a string
     * @param string String to escape
     * @returns Escaped string safe for use in regex
     */
    private escapeRegex(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
}
