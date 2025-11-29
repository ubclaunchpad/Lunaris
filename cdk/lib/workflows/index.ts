import * as fs from "fs";
import * as path from "path";
import { WorkflowConfig } from "./types";

/**
 * Registry for managing Step Functions workflow configurations
 * Provides centralized workflow discovery, registration, and retrieval
 */
export class WorkflowRegistry {
    private static workflows: Map<string, WorkflowConfig> = new Map();

    /**
     * Register a workflow configuration
     * @param config The workflow configuration to register
     * @param overwrite Whether to overwrite an existing workflow with the same name (default: false)
     * @throws Error if a workflow with the same name is already registered and overwrite is false
     */
    public static registerWorkflow(config: WorkflowConfig, overwrite: boolean = false): void {
        if (this.workflows.has(config.name) && !overwrite) {
            throw new Error(`Workflow '${config.name}' is already registered`);
        }
        this.workflows.set(config.name, config);
    }

    /**
     * Retrieve a workflow configuration by name
     * @param name The name of the workflow to retrieve
     * @returns The workflow configuration or undefined if not found
     */
    public static getWorkflow(name: string): WorkflowConfig | undefined {
        return this.workflows.get(name);
    }

    /**
     * Get all registered workflow configurations
     * @returns Array of all registered workflow configurations
     */
    public static getAllWorkflows(): WorkflowConfig[] {
        return Array.from(this.workflows.values());
    }

    /**
     * Get all registered workflow names
     * @returns Array of all registered workflow names
     */
    public static getWorkflowNames(): string[] {
        return Array.from(this.workflows.keys());
    }

    /**
     * Check if a workflow is registered
     * @param name The name of the workflow to check
     * @returns True if the workflow is registered, false otherwise
     */
    public static hasWorkflow(name: string): boolean {
        return this.workflows.has(name);
    }

    /**
     * Clear all registered workflows (primarily for testing)
     */
    public static clearRegistry(): void {
        this.workflows.clear();
    }

    /**
     * Automatically discover and register workflows from the stepfunctions directory
     * Looks for workflow.config.ts files in subdirectories
     * @param stepfunctionsPath Optional path to the stepfunctions directory (defaults to relative path)
     */
    public static discoverWorkflows(stepfunctionsPath?: string): void {
        const workflowsDir = stepfunctionsPath || path.join(__dirname, "../../stepfunctions");

        if (!fs.existsSync(workflowsDir)) {
            console.warn(`Stepfunctions directory not found at: ${workflowsDir}`);
            return;
        }

        try {
            const workflowDirs = fs
                .readdirSync(workflowsDir, { withFileTypes: true })
                .filter((dirent) => dirent.isDirectory())
                .map((dirent) => dirent.name);

            workflowDirs.forEach((workflowDir) => {
                // Try both .ts (development) and .js (compiled) extensions
                const tsConfigPath = path.join(workflowsDir, workflowDir, "workflow.config.ts");
                const jsConfigPath = path.join(workflowsDir, workflowDir, "workflow.config.js");

                const configPath = fs.existsSync(tsConfigPath)
                    ? tsConfigPath
                    : fs.existsSync(jsConfigPath)
                      ? jsConfigPath
                      : null;

                if (configPath) {
                    try {
                        // Use require to load the configuration
                        const configModule = require(configPath);
                        const config = configModule.default || configModule;

                        if (this.isValidWorkflowConfig(config)) {
                            // Skip registration if workflow already exists (e.g., from tests)
                            if (!this.hasWorkflow(config.name)) {
                                this.registerWorkflow(config);
                            }
                        } else {
                            console.warn(`Invalid workflow configuration found at: ${configPath}`);
                        }
                    } catch (error) {
                        console.warn(
                            `Failed to load workflow configuration from ${configPath}:`,
                            error,
                        );
                    }
                }
            });
        } catch (error) {
            console.warn(`Failed to discover workflows in ${workflowsDir}:`, error);
        }
    }

    /**
     * Validate that an object is a valid WorkflowConfig
     * @param config The object to validate
     * @returns True if the object is a valid WorkflowConfig
     */
    private static isValidWorkflowConfig(config: unknown): config is WorkflowConfig {
        if (!config || typeof config !== "object") return false;
        const c = config as Record<string, unknown>;
        return (
            typeof c.name === "string" &&
            typeof c.description === "string" &&
            typeof c.definitionPath === "string" &&
            c.lambdaFunctions !== undefined &&
            typeof c.lambdaFunctions === "object"
        );
    }
}

// Export all workflow-related types and utilities
export * from "./types";
export * from "./utilities";
