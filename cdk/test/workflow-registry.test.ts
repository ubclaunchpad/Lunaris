import { WorkflowRegistry } from "../lib/workflows/index";
import { WorkflowConfig } from "../lib/workflows/types";
import { Duration } from "aws-cdk-lib";
import * as fs from "fs";
import * as path from "path";

describe("WorkflowRegistry", () => {
    // Test workflow configurations
    const testWorkflow1: WorkflowConfig = {
        name: "TestWorkflow1",
        description: "First test workflow",
        definitionPath: "test-workflow-1/definition.asl.json",
        lambdaFunctions: {
            testLambda: {
                functionName: "testLambdaFunction",
                placeholder: "${TestLambdaArn}",
                required: true,
            },
        },
    };

    const testWorkflow2: WorkflowConfig = {
        name: "TestWorkflow2",
        description: "Second test workflow",
        definitionPath: "test-workflow-2/definition.asl.json",
        timeout: Duration.minutes(10),
        lambdaFunctions: {
            anotherLambda: {
                functionName: "anotherLambdaFunction",
                placeholder: "${AnotherLambdaArn}",
                required: false,
            },
        },
        retryConfig: {
            maxAttempts: 3,
            backoffRate: 2.0,
            intervalSeconds: 2,
        },
    };

    beforeEach(() => {
        // Clear the registry before each test
        WorkflowRegistry.clearRegistry();
    });

    describe("registerWorkflow", () => {
        test("should register a workflow successfully", () => {
            WorkflowRegistry.registerWorkflow(testWorkflow1);

            expect(WorkflowRegistry.hasWorkflow("TestWorkflow1")).toBe(true);
            expect(WorkflowRegistry.getWorkflow("TestWorkflow1")).toEqual(testWorkflow1);
        });

        test("should register multiple workflows", () => {
            WorkflowRegistry.registerWorkflow(testWorkflow1);
            WorkflowRegistry.registerWorkflow(testWorkflow2);

            expect(WorkflowRegistry.hasWorkflow("TestWorkflow1")).toBe(true);
            expect(WorkflowRegistry.hasWorkflow("TestWorkflow2")).toBe(true);
            expect(WorkflowRegistry.getAllWorkflows()).toHaveLength(2);
        });

        test("should throw error for duplicate workflow registration", () => {
            WorkflowRegistry.registerWorkflow(testWorkflow1);

            expect(() => {
                WorkflowRegistry.registerWorkflow(testWorkflow1);
            }).toThrow("Workflow 'TestWorkflow1' is already registered");
        });

        test("should throw error for workflow with same name but different config", () => {
            WorkflowRegistry.registerWorkflow(testWorkflow1);

            const duplicateNameWorkflow: WorkflowConfig = {
                ...testWorkflow1,
                description: "Different description",
            };

            expect(() => {
                WorkflowRegistry.registerWorkflow(duplicateNameWorkflow);
            }).toThrow("Workflow 'TestWorkflow1' is already registered");
        });
    });

    describe("getWorkflow", () => {
        test("should return workflow configuration for registered workflow", () => {
            WorkflowRegistry.registerWorkflow(testWorkflow1);

            const retrieved = WorkflowRegistry.getWorkflow("TestWorkflow1");
            expect(retrieved).toEqual(testWorkflow1);
        });

        test("should return undefined for non-existent workflow", () => {
            const retrieved = WorkflowRegistry.getWorkflow("NonExistentWorkflow");
            expect(retrieved).toBeUndefined();
        });

        test("should return correct workflow when multiple are registered", () => {
            WorkflowRegistry.registerWorkflow(testWorkflow1);
            WorkflowRegistry.registerWorkflow(testWorkflow2);

            expect(WorkflowRegistry.getWorkflow("TestWorkflow1")).toEqual(testWorkflow1);
            expect(WorkflowRegistry.getWorkflow("TestWorkflow2")).toEqual(testWorkflow2);
        });
    });

    describe("getAllWorkflows", () => {
        test("should return empty array when no workflows are registered", () => {
            const workflows = WorkflowRegistry.getAllWorkflows();
            expect(workflows).toEqual([]);
        });

        test("should return all registered workflows", () => {
            WorkflowRegistry.registerWorkflow(testWorkflow1);
            WorkflowRegistry.registerWorkflow(testWorkflow2);

            const workflows = WorkflowRegistry.getAllWorkflows();
            expect(workflows).toHaveLength(2);
            expect(workflows).toContain(testWorkflow1);
            expect(workflows).toContain(testWorkflow2);
        });
    });

    describe("getWorkflowNames", () => {
        test("should return empty array when no workflows are registered", () => {
            const names = WorkflowRegistry.getWorkflowNames();
            expect(names).toEqual([]);
        });

        test("should return all workflow names", () => {
            WorkflowRegistry.registerWorkflow(testWorkflow1);
            WorkflowRegistry.registerWorkflow(testWorkflow2);

            const names = WorkflowRegistry.getWorkflowNames();
            expect(names).toHaveLength(2);
            expect(names).toContain("TestWorkflow1");
            expect(names).toContain("TestWorkflow2");
        });
    });

    describe("hasWorkflow", () => {
        test("should return false for non-existent workflow", () => {
            expect(WorkflowRegistry.hasWorkflow("NonExistentWorkflow")).toBe(false);
        });

        test("should return true for registered workflow", () => {
            WorkflowRegistry.registerWorkflow(testWorkflow1);
            expect(WorkflowRegistry.hasWorkflow("TestWorkflow1")).toBe(true);
        });

        test("should return false after clearing registry", () => {
            WorkflowRegistry.registerWorkflow(testWorkflow1);
            WorkflowRegistry.clearRegistry();
            expect(WorkflowRegistry.hasWorkflow("TestWorkflow1")).toBe(false);
        });
    });

    describe("clearRegistry", () => {
        test("should clear all registered workflows", () => {
            WorkflowRegistry.registerWorkflow(testWorkflow1);
            WorkflowRegistry.registerWorkflow(testWorkflow2);

            expect(WorkflowRegistry.getAllWorkflows()).toHaveLength(2);

            WorkflowRegistry.clearRegistry();

            expect(WorkflowRegistry.getAllWorkflows()).toHaveLength(0);
            expect(WorkflowRegistry.hasWorkflow("TestWorkflow1")).toBe(false);
            expect(WorkflowRegistry.hasWorkflow("TestWorkflow2")).toBe(false);
        });
    });

    describe("discoverWorkflows", () => {
        const testStepfunctionsDir = path.join(__dirname, "test-stepfunctions");
        const testWorkflowDir1 = path.join(testStepfunctionsDir, "test-workflow-1");
        const testWorkflowDir2 = path.join(testStepfunctionsDir, "test-workflow-2");
        const testWorkflowDir3 = path.join(testStepfunctionsDir, "invalid-workflow");

        beforeEach(() => {
            // Clean up any existing test directories
            if (fs.existsSync(testStepfunctionsDir)) {
                fs.rmSync(testStepfunctionsDir, { recursive: true, force: true });
            }

            // Create fresh test directory structure
            fs.mkdirSync(testStepfunctionsDir, { recursive: true });
            fs.mkdirSync(testWorkflowDir1, { recursive: true });
            fs.mkdirSync(testWorkflowDir2, { recursive: true });
            fs.mkdirSync(testWorkflowDir3, { recursive: true });

            // Clear registry
            WorkflowRegistry.clearRegistry();

            // Clear require cache for test config files
            Object.keys(require.cache).forEach((key) => {
                if (key.includes("test-stepfunctions")) {
                    delete require.cache[key];
                }
            });
        });

        afterEach(() => {
            // Clean up test directories
            if (fs.existsSync(testStepfunctionsDir)) {
                fs.rmSync(testStepfunctionsDir, { recursive: true, force: true });
            }
        });

        test("should discover and register workflows from directory structure", () => {
            // Create valid workflow config files
            const config1Path = path.join(testWorkflowDir1, "workflow.config.ts");
            const config2Path = path.join(testWorkflowDir2, "workflow.config.ts");

            fs.writeFileSync(
                config1Path,
                `
        module.exports = {
          name: 'DiscoveredWorkflow1',
          description: 'First discovered workflow',
          definitionPath: 'test-workflow-1/definition.asl.json',
          lambdaFunctions: {
            testLambda: {
              functionName: 'testLambdaFunction',
              placeholder: '\${TestLambdaArn}',
              required: true,
            },
          },
        };
      `,
            );

            fs.writeFileSync(
                config2Path,
                `
        module.exports = {
          name: 'DiscoveredWorkflow2',
          description: 'Second discovered workflow',
          definitionPath: 'test-workflow-2/definition.asl.json',
          lambdaFunctions: {
            anotherLambda: {
              functionName: 'anotherLambdaFunction',
              placeholder: '\${AnotherLambdaArn}',
              required: false,
            },
          },
        };
      `,
            );

            WorkflowRegistry.discoverWorkflows(testStepfunctionsDir);

            expect(WorkflowRegistry.hasWorkflow("DiscoveredWorkflow1")).toBe(true);
            expect(WorkflowRegistry.hasWorkflow("DiscoveredWorkflow2")).toBe(true);
            expect(WorkflowRegistry.getAllWorkflows()).toHaveLength(2);
        });

        test("should handle directories without workflow.config.ts files", () => {
            // Create directory without config file
            const emptyDir = path.join(testStepfunctionsDir, "empty-workflow");
            fs.mkdirSync(emptyDir, { recursive: true });

            WorkflowRegistry.discoverWorkflows(testStepfunctionsDir);

            expect(WorkflowRegistry.getAllWorkflows()).toHaveLength(0);
        });

        test("should handle invalid workflow configuration files", () => {
            // Create invalid workflow config file
            const invalidConfigPath = path.join(testWorkflowDir3, "workflow.config.ts");
            fs.writeFileSync(
                invalidConfigPath,
                `
        module.exports = {
          // Missing required fields
          description: 'Invalid workflow',
        };
      `,
            );

            // Mock console.warn to capture warnings
            const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

            WorkflowRegistry.discoverWorkflows(testStepfunctionsDir);

            expect(WorkflowRegistry.getAllWorkflows()).toHaveLength(0);
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining("Invalid workflow configuration found at:"),
            );

            consoleSpy.mockRestore();
        });

        test("should handle non-existent stepfunctions directory", () => {
            const nonExistentDir = path.join(__dirname, "non-existent-stepfunctions");

            // Mock console.warn to capture warnings
            const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

            WorkflowRegistry.discoverWorkflows(nonExistentDir);

            expect(WorkflowRegistry.getAllWorkflows()).toHaveLength(0);
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining("Stepfunctions directory not found at:"),
            );

            consoleSpy.mockRestore();
        });

        test("should handle malformed JavaScript in config files", () => {
            // Clear registry and ensure clean state
            WorkflowRegistry.clearRegistry();

            // Create malformed workflow config file with actual syntax error
            const malformedConfigPath = path.join(testWorkflowDir1, "workflow.config.ts");
            fs.writeFileSync(
                malformedConfigPath,
                `
        // This is malformed JavaScript with syntax error
        module.exports = {
          name: 'MalformedWorkflow'
          description: 'Missing comma above'
          definitionPath: 'test'
          lambdaFunctions: {
        // Missing closing braces
      `,
            );

            // Clear require cache to ensure fresh load
            delete require.cache[malformedConfigPath];

            // Mock console.warn to capture warnings
            const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

            WorkflowRegistry.discoverWorkflows(testStepfunctionsDir);

            expect(WorkflowRegistry.getAllWorkflows()).toHaveLength(0);
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining("Failed to load workflow configuration from"),
            );

            consoleSpy.mockRestore();
        });

        test("should use default stepfunctions path when none provided", () => {
            // This test verifies the method can be called without parameters
            // It will likely warn about missing directory, which is expected
            const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

            WorkflowRegistry.discoverWorkflows();

            // Should not throw an error
            expect(WorkflowRegistry.getAllWorkflows()).toHaveLength(0);

            consoleSpy.mockRestore();
        });
    });
});
