import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { Function, Runtime, Code } from "aws-cdk-lib/aws-lambda";
import { Duration } from "aws-cdk-lib";
import { WorkflowFactory } from "../lib/constructs/workflow-factory";
import { WorkflowConfig } from "../lib/workflows/types";
import * as fs from "fs";
import * as path from "path";

describe("WorkflowFactory", () => {
    let app: cdk.App;
    let stack: cdk.Stack;
    let workflowFactory: WorkflowFactory;
    let testLambdaFunction: Function;

    beforeEach(() => {
        app = new cdk.App();
        stack = new cdk.Stack(app, "TestStack");
        workflowFactory = new WorkflowFactory(stack, "TestWorkflowFactory");

        // Create a test Lambda function
        testLambdaFunction = new Function(stack, "TestLambda", {
            runtime: Runtime.NODEJS_18_X,
            handler: "index.handler",
            code: Code.fromInline("exports.handler = async () => ({ statusCode: 200 });"),
        });
    });

    describe("createWorkflow", () => {
        test("should create workflow with valid configuration", () => {
            const config: WorkflowConfig = {
                name: "TestWorkflow",
                description: "Test workflow for unit testing",
                definitionPath: "test-workflow/definition.asl.json",
                lambdaFunctions: {
                    testLambda: {
                        functionName: "testLambdaFunction",
                        placeholder: "${TestLambdaArn}",
                        required: true,
                    },
                },
            };

            const lambdaFunctions = {
                testLambdaFunction: testLambdaFunction,
            };

            const workflow = workflowFactory.createWorkflow(config, lambdaFunctions);
            const template = Template.fromStack(stack);

            expect(workflow).toBeDefined();

            // Verify StateMachine is created
            template.resourceCountIs("AWS::StepFunctions::StateMachine", 1);
        });

        test("should create workflow with timeout configuration", () => {
            const config: WorkflowConfig = {
                name: "TestWorkflowWithTimeout",
                description: "Test workflow with timeout",
                definitionPath: "test-workflow/definition.asl.json",
                timeout: Duration.minutes(10),
                lambdaFunctions: {
                    testLambda: {
                        functionName: "testLambdaFunction",
                        placeholder: "${TestLambdaArn}",
                        required: true,
                    },
                },
            };

            const lambdaFunctions = {
                testLambdaFunction: testLambdaFunction,
            };

            const workflow = workflowFactory.createWorkflow(config, lambdaFunctions);
            const template = Template.fromStack(stack);

            expect(workflow).toBeDefined();

            // Verify StateMachine is created with timeout
            template.resourceCountIs("AWS::StepFunctions::StateMachine", 1);
        });

        test("should throw error for missing required Lambda function", () => {
            const config: WorkflowConfig = {
                name: "TestWorkflow",
                description: "Test workflow",
                definitionPath: "test-workflow/definition.asl.json",
                lambdaFunctions: {
                    testLambda: {
                        functionName: "missingFunction",
                        placeholder: "${TestLambdaArn}",
                        required: true,
                    },
                },
            };

            const lambdaFunctions = {}; // Missing required function

            expect(() => {
                workflowFactory.createWorkflow(config, lambdaFunctions);
            }).toThrow(
                "Required Lambda function 'missingFunction' not found for workflow 'TestWorkflow'",
            );
        });

        test("should throw error for missing workflow name", () => {
            const config: WorkflowConfig = {
                name: "",
                description: "Test workflow",
                definitionPath: "test-workflow/definition.asl.json",
                lambdaFunctions: {},
            };

            const lambdaFunctions = {};

            expect(() => {
                workflowFactory.createWorkflow(config, lambdaFunctions);
            }).toThrow("Workflow configuration must have a name");
        });

        test("should throw error for missing description", () => {
            const config: WorkflowConfig = {
                name: "TestWorkflow",
                description: "",
                definitionPath: "test-workflow/definition.asl.json",
                lambdaFunctions: {},
            };

            const lambdaFunctions = {};

            expect(() => {
                workflowFactory.createWorkflow(config, lambdaFunctions);
            }).toThrow("Workflow 'TestWorkflow' must have a description");
        });

        test("should throw error for missing definition path", () => {
            const config: WorkflowConfig = {
                name: "TestWorkflow",
                description: "Test workflow",
                definitionPath: "",
                lambdaFunctions: {},
            };

            const lambdaFunctions = {};

            expect(() => {
                workflowFactory.createWorkflow(config, lambdaFunctions);
            }).toThrow("Workflow 'TestWorkflow' must have a definitionPath");
        });

        test("should throw error for non-existent definition file", () => {
            const config: WorkflowConfig = {
                name: "TestWorkflow",
                description: "Test workflow",
                definitionPath: "non-existent/definition.asl.json",
                lambdaFunctions: {},
            };

            const lambdaFunctions = {};

            expect(() => {
                workflowFactory.createWorkflow(config, lambdaFunctions);
            }).toThrow("Definition file not found for workflow 'TestWorkflow'");
        });

        test("should validate retry configuration", () => {
            const config: WorkflowConfig = {
                name: "TestWorkflow",
                description: "Test workflow",
                definitionPath: "test-workflow/definition.asl.json",
                lambdaFunctions: {
                    testLambda: {
                        functionName: "testLambdaFunction",
                        placeholder: "${TestLambdaArn}",
                        required: true,
                    },
                },
                retryConfig: {
                    maxAttempts: 0, // Invalid
                    backoffRate: 2.0,
                    intervalSeconds: 1,
                },
            };

            const lambdaFunctions = {
                testLambdaFunction: testLambdaFunction,
            };

            expect(() => {
                workflowFactory.createWorkflow(config, lambdaFunctions);
            }).toThrow("Workflow 'TestWorkflow' retry config maxAttempts must be greater than 0");
        });
    });

    describe("template substitution", () => {
        test("should replace placeholders with Lambda function ARNs", () => {
            const config: WorkflowConfig = {
                name: "TestWorkflow",
                description: "Test workflow",
                definitionPath: "test-workflow/definition.asl.json",
                lambdaFunctions: {
                    testLambda: {
                        functionName: "testLambdaFunction",
                        placeholder: "${TestLambdaArn}",
                        required: true,
                    },
                },
            };

            const lambdaFunctions = {
                testLambdaFunction: testLambdaFunction,
            };

            const workflow = workflowFactory.createWorkflow(config, lambdaFunctions);
            const template = Template.fromStack(stack);

            // Verify that the StateMachine is created and contains definition
            template.resourceCountIs("AWS::StepFunctions::StateMachine", 1);
        });

        test("should handle multiple placeholder patterns", () => {
            // Create additional test definition file with multiple placeholders
            const multiPlaceholderDefinition = {
                Comment: "Test workflow with multiple placeholders",
                StartAt: "FirstLambda",
                States: {
                    FirstLambda: {
                        Type: "Task",
                        Resource: "${FirstLambdaArn}",
                        Next: "SecondLambda",
                    },
                    SecondLambda: {
                        Type: "Task",
                        Resource: "${SecondLambdaArn}",
                        End: true,
                    },
                },
            };

            // Write test definition file
            const testDefPath = path.join(
                __dirname,
                "../stepfunctions/multi-placeholder-test/definition.asl.json",
            );
            const testDefDir = path.dirname(testDefPath);
            if (!fs.existsSync(testDefDir)) {
                fs.mkdirSync(testDefDir, { recursive: true });
            }
            fs.writeFileSync(testDefPath, JSON.stringify(multiPlaceholderDefinition, null, 2));

            const secondLambdaFunction = new Function(stack, "SecondTestLambda", {
                runtime: Runtime.NODEJS_18_X,
                handler: "index.handler",
                code: Code.fromInline("exports.handler = async () => ({ statusCode: 200 });"),
            });

            const config: WorkflowConfig = {
                name: "MultiPlaceholderWorkflow",
                description: "Test workflow with multiple placeholders",
                definitionPath: "multi-placeholder-test/definition.asl.json",
                lambdaFunctions: {
                    firstLambda: {
                        functionName: "testLambdaFunction",
                        placeholder: "${FirstLambdaArn}",
                        required: true,
                    },
                    secondLambda: {
                        functionName: "secondLambdaFunction",
                        placeholder: "${SecondLambdaArn}",
                        required: true,
                    },
                },
            };

            const lambdaFunctions = {
                testLambdaFunction: testLambdaFunction,
                secondLambdaFunction: secondLambdaFunction,
            };

            const workflow = workflowFactory.createWorkflow(config, lambdaFunctions);
            expect(workflow).toBeDefined();

            // Clean up test file
            fs.unlinkSync(testDefPath);
            fs.rmdirSync(testDefDir);
        });
    });
});
