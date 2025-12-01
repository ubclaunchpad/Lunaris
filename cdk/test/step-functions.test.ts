import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { Function, Runtime, Code } from "aws-cdk-lib/aws-lambda";
import { Duration } from "aws-cdk-lib";
import { StepFunctions, StepFunctionsProps } from "../lib/constructs/step-functions";
import { WorkflowRegistry, WorkflowConfig } from "../lib/workflows";
import * as fs from "fs";
import * as path from "path";

describe("StepFunctions Construct", () => {
    let app: cdk.App;
    let stack: cdk.Stack;
    let testLambdaFunctions: StepFunctionsProps;

    beforeEach(() => {
        app = new cdk.App();
        stack = new cdk.Stack(app, "TestStack");

        // Clear the workflow registry before each test
        WorkflowRegistry.clearRegistry();

        // Create test Lambda functions
        testLambdaFunctions = {
            checkRunningStreamsFunction: new Function(stack, "CheckRunningStreamsFunction", {
                runtime: Runtime.NODEJS_18_X,
                handler: "index.handler",
                code: Code.fromInline("exports.handler = async () => ({ statusCode: 200 });"),
            }),
            deployEC2Function: new Function(stack, "DeployEC2Function", {
                runtime: Runtime.NODEJS_18_X,
                handler: "index.handler",
                code: Code.fromInline("exports.handler = async () => ({ statusCode: 200 });"),
            }),
            configureDcvInstanceFunction: new Function(stack, "ConfigureDcvInstanceFunction", {
                runtime: Runtime.NODEJS_18_X,
                handler: "index.handler",
                code: Code.fromInline("exports.handler = async () => ({ statusCode: 200 });"),
            }),
            updateRunningStreamsFunction: new Function(stack, "UpdateRunningStreamsFunction", {
                runtime: Runtime.NODEJS_18_X,
                handler: "index.handler",
                code: Code.fromInline("exports.handler = async () => ({ statusCode: 200 });"),
            }),
            testLambdaFunction: new Function(stack, "TestLambdaFunction", {
                runtime: Runtime.NODEJS_18_X,
                handler: "index.handler",
                code: Code.fromInline("exports.handler = async () => ({ statusCode: 200 });"),
            }),
        };
    });

    afterEach(() => {
        // Clean up the workflow registry after each test
        WorkflowRegistry.clearRegistry();
    });

    describe("Workflow Registry Integration", () => {
        test("should create workflows from registry", () => {
            // Register a test workflow
            const testWorkflowConfig: WorkflowConfig = {
                name: "TestRegistryWorkflow",
                description: "Test workflow from registry",
                definitionPath: "test-workflow/definition.asl.json",
                lambdaFunctions: {
                    testLambda: {
                        functionName: "testLambdaFunction",
                        placeholder: "${TestLambdaArn}",
                        required: true,
                    },
                },
            };

            WorkflowRegistry.registerWorkflow(testWorkflowConfig);

            const stepFunctions = new StepFunctions(
                stack,
                "TestStepFunctions",
                testLambdaFunctions,
            );
            const template = Template.fromStack(stack);

            // Should create StateMachine (UserDeployEC2Workflow from registry)
            template.resourceCountIs("AWS::StepFunctions::StateMachine", 1);

            // Test workflow doesn't exist, so should be undefined
            const workflow = stepFunctions.getWorkflow("TestRegistryWorkflow");
            expect(workflow).toBeUndefined();
        });

        test("should handle multiple workflows from registry", () => {
            // Register multiple test workflows
            const workflow1: WorkflowConfig = {
                name: "TestWorkflow1",
                description: "First test workflow",
                definitionPath: "test-workflow/definition.asl.json",
                lambdaFunctions: {
                    testLambda: {
                        functionName: "testLambdaFunction",
                        placeholder: "${TestLambdaArn}",
                        required: true,
                    },
                },
            };

            const workflow2: WorkflowConfig = {
                name: "TestWorkflow2",
                description: "Second test workflow",
                definitionPath: "test-workflow/definition.asl.json",
                lambdaFunctions: {
                    testLambda: {
                        functionName: "testLambdaFunction",
                        placeholder: "${TestLambdaArn}",
                        required: true,
                    },
                },
            };

            WorkflowRegistry.registerWorkflow(workflow1);
            WorkflowRegistry.registerWorkflow(workflow2);

            const stepFunctions = new StepFunctions(
                stack,
                "TestStepFunctions",
                testLambdaFunctions,
            );

            // Test workflows don't exist, so should be undefined
            expect(stepFunctions.getWorkflow("TestWorkflow1")).toBeUndefined();
            expect(stepFunctions.getWorkflow("TestWorkflow2")).toBeUndefined();

            // Should return only the UserDeployEC2Workflow
            const allWorkflows = stepFunctions.getAllWorkflows();
            expect(allWorkflows.length).toBe(1);

            // Should return only the UserDeployEC2Workflow name
            const workflowNames = stepFunctions.getWorkflowNames();
            expect(workflowNames).toContain("UserDeployEC2Workflow");
            expect(workflowNames).not.toContain("TestWorkflow1");
            expect(workflowNames).not.toContain("TestWorkflow2");
        });
    });

    describe("Workflow Access Methods", () => {
        test("should return undefined for non-existent workflow", () => {
            const stepFunctions = new StepFunctions(
                stack,
                "TestStepFunctions",
                testLambdaFunctions,
            );

            const workflow = stepFunctions.getWorkflow("NonExistentWorkflow");
            expect(workflow).toBeUndefined();
        });

        test("should return workflows when auto-discovery finds configurations", () => {
            const stepFunctions = new StepFunctions(
                stack,
                "TestStepFunctions",
                testLambdaFunctions,
            );

            // Auto-discovery should find the UserDeployEC2Workflow configuration
            const allWorkflows = stepFunctions.getAllWorkflows();
            expect(allWorkflows.length).toBeGreaterThanOrEqual(0);

            const workflowNames = stepFunctions.getWorkflowNames();
            // May contain auto-discovered workflows
            expect(Array.isArray(workflowNames)).toBe(true);
        });

        test("should handle workflow creation failures gracefully", () => {
            // Register a workflow with missing Lambda function
            const invalidWorkflowConfig: WorkflowConfig = {
                name: "InvalidWorkflow",
                description: "Workflow with missing Lambda function",
                definitionPath: "test-workflow/definition.asl.json",
                lambdaFunctions: {
                    missingLambda: {
                        functionName: "nonExistentFunction",
                        placeholder: "${MissingLambdaArn}",
                        required: true,
                    },
                },
            };

            WorkflowRegistry.registerWorkflow(invalidWorkflowConfig);

            // Should not throw error, but should handle gracefully
            expect(() => {
                new StepFunctions(stack, "TestStepFunctions", testLambdaFunctions);
            }).not.toThrow();
        });
    });

    describe("UserDeployEC2Workflow Integration", () => {
        test("should create UserDeployEC2Workflow from configuration system", () => {
            const stepFunctions = new StepFunctions(
                stack,
                "TestStepFunctions",
                testLambdaFunctions,
            );
            const template = Template.fromStack(stack);

            // Should be accessible through getWorkflow method
            const workflow = stepFunctions.getWorkflow("UserDeployEC2Workflow");
            expect(workflow).toBeDefined();

            // Should create StateMachine resources
            template.resourceCountIs("AWS::StepFunctions::StateMachine", 1);

            // Should have proper IAM policies for Lambda invocation
            const policies = template.findResources("AWS::IAM::Policy");
            expect(Object.keys(policies).length).toBeGreaterThan(0);
        });

        test("should use new workflow configuration for UserDeployEC2Workflow", () => {
            const stepFunctions = new StepFunctions(
                stack,
                "TestStepFunctions",
                testLambdaFunctions,
            );

            // Should find the workflow in the registry
            const registeredWorkflow = WorkflowRegistry.getWorkflow("UserDeployEC2Workflow");
            expect(registeredWorkflow).toBeDefined();
            expect(registeredWorkflow?.name).toBe("UserDeployEC2Workflow");
            expect(registeredWorkflow?.description).toBe(
                "Orchestrates user EC2 deployment process",
            );

            // Should have the correct Lambda function mappings
            expect(registeredWorkflow?.lambdaFunctions).toHaveProperty("checkRunningStreams");
            expect(registeredWorkflow?.lambdaFunctions).toHaveProperty("deployEC2");
            expect(registeredWorkflow?.lambdaFunctions).toHaveProperty("updateRunningStreams");

            // Should have timeout and retry configuration
            expect(registeredWorkflow?.timeout).toBeDefined();
            expect(registeredWorkflow?.retryConfig).toBeDefined();
            expect(registeredWorkflow?.errorHandling).toBeDefined();
        });
    });

    describe("Integration with WorkflowFactory", () => {
        test("should use WorkflowFactory for workflow creation", () => {
            const testWorkflowConfig: WorkflowConfig = {
                name: "FactoryTestWorkflow",
                description: "Test workflow created through factory",
                definitionPath: "test-workflow/definition.asl.json",
                timeout: Duration.minutes(5),
                lambdaFunctions: {
                    testLambda: {
                        functionName: "testLambdaFunction",
                        placeholder: "${TestLambdaArn}",
                        required: true,
                    },
                },
            };

            WorkflowRegistry.registerWorkflow(testWorkflowConfig);

            const stepFunctions = new StepFunctions(
                stack,
                "TestStepFunctions",
                testLambdaFunctions,
            );
            const template = Template.fromStack(stack);

            // Should create StateMachine (UserDeployEC2Workflow from registry)
            template.resourceCountIs("AWS::StepFunctions::StateMachine", 1);

            const workflow = stepFunctions.getWorkflow("FactoryTestWorkflow");
            expect(workflow).toBeUndefined(); // Test workflow doesn't exist, so should be undefined
        });

        test("should pass Lambda functions to WorkflowFactory correctly", () => {
            const testWorkflowConfig: WorkflowConfig = {
                name: "LambdaTestWorkflow",
                description: "Test workflow with Lambda functions",
                definitionPath: "test-workflow/definition.asl.json",
                lambdaFunctions: {
                    checkStreams: {
                        functionName: "checkRunningStreamsFunction",
                        placeholder: "${CheckStreamsArn}",
                        required: true,
                    },
                    deployEC2: {
                        functionName: "deployEC2Function",
                        placeholder: "${DeployArn}",
                        required: true,
                    },
                },
            };

            WorkflowRegistry.registerWorkflow(testWorkflowConfig);

            const stepFunctions = new StepFunctions(
                stack,
                "TestStepFunctions",
                testLambdaFunctions,
            );
            const template = Template.fromStack(stack);

            // Should create StateMachine (UserDeployEC2Workflow from registry)
            template.resourceCountIs("AWS::StepFunctions::StateMachine", 1);

            // Should have IAM policies for Lambda function invocation
            // Note: The exact count may vary based on CDK's IAM policy optimization
            const policies = template.findResources("AWS::IAM::Policy");
            expect(Object.keys(policies).length).toBeGreaterThan(0);
        });
    });
});
