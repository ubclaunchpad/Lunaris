import { Duration } from "aws-cdk-lib";
import {
    createSequentialWorkflow,
    createParallelWorkflow,
    createChoiceWorkflow,
    createLambdaFunctionRef,
    createRetryConfig,
    createErrorHandlingConfig,
    createStandardErrorHandling,
    createWorkflowWithDefaults,
    validateWorkflowConfig,
    validateLambdaFunctionRef,
    validateRetryConfigObject,
    validateErrorHandlingConfig,
    validateWorkflowConfigs,
} from "../lib/workflows/utilities";
import {
    WorkflowConfig,
    LambdaFunctionRef,
    RetryConfig,
    ErrorHandlingConfig,
} from "../lib/workflows/types";

describe("Workflow Utilities", () => {
    describe("createSequentialWorkflow", () => {
        test("should create basic sequential workflow configuration", () => {
            const config = createSequentialWorkflow(
                "TestSequentialWorkflow",
                "A test sequential workflow",
                ["functionA", "functionB", "functionC"],
            );

            expect(config.name).toBe("TestSequentialWorkflow");
            expect(config.description).toBe("A test sequential workflow");
            expect(config.definitionPath).toBe("test-sequential-workflow/definition.asl.json");
            expect(Object.keys(config.lambdaFunctions)).toHaveLength(3);
            expect(config.lambdaFunctions.step1.functionName).toBe("functionA");
            expect(config.lambdaFunctions.step1.placeholder).toBe("${FunctionAArn}");
            expect(config.lambdaFunctions.step2.functionName).toBe("functionB");
            expect(config.lambdaFunctions.step3.functionName).toBe("functionC");
        });

        test("should create sequential workflow with custom options", () => {
            const retryConfig = createRetryConfig(5, 1.5, 3);
            const errorHandling = createErrorHandlingConfig(false);
            const timeout = Duration.minutes(30);

            const config = createSequentialWorkflow(
                "CustomSequentialWorkflow",
                "Custom sequential workflow",
                ["stepOne", "stepTwo"],
                {
                    timeout,
                    retryConfig,
                    errorHandling,
                    definitionPath: "custom/path/definition.asl.json",
                },
            );

            expect(config.timeout).toBe(timeout);
            expect(config.retryConfig).toBe(retryConfig);
            expect(config.errorHandling).toBe(errorHandling);
            expect(config.definitionPath).toBe("custom/path/definition.asl.json");
        });
    });

    describe("createParallelWorkflow", () => {
        test("should create parallel workflow configuration", () => {
            const branches = {
                branchA: ["functionA1", "functionA2"],
                branchB: ["functionB1"],
                branchC: ["functionC1", "functionC2", "functionC3"],
            };

            const config = createParallelWorkflow(
                "TestParallelWorkflow",
                "A test parallel workflow",
                branches,
            );

            expect(config.name).toBe("TestParallelWorkflow");
            expect(config.description).toBe("A test parallel workflow");
            expect(Object.keys(config.lambdaFunctions)).toHaveLength(6);
            expect(config.lambdaFunctions.branchAStep1.functionName).toBe("functionA1");
            expect(config.lambdaFunctions.branchAStep2.functionName).toBe("functionA2");
            expect(config.lambdaFunctions.branchBStep1.functionName).toBe("functionB1");
            expect(config.lambdaFunctions.branchCStep3.functionName).toBe("functionC3");
        });
    });

    describe("createChoiceWorkflow", () => {
        test("should create choice workflow configuration", () => {
            const branches = {
                pathA: ["functionA1", "functionA2"],
                pathB: ["functionB1"],
            };

            const config = createChoiceWorkflow(
                "TestChoiceWorkflow",
                "A test choice workflow",
                "decisionFunction",
                branches,
            );

            expect(config.name).toBe("TestChoiceWorkflow");
            expect(config.description).toBe("A test choice workflow");
            expect(config.lambdaFunctions.decision.functionName).toBe("decisionFunction");
            expect(config.lambdaFunctions.pathAStep1.functionName).toBe("functionA1");
            expect(config.lambdaFunctions.pathBStep1.functionName).toBe("functionB1");
        });
    });

    describe("createLambdaFunctionRef", () => {
        test("should create Lambda function reference with defaults", () => {
            const ref = createLambdaFunctionRef("testFunction", "${TestFunctionArn}");

            expect(ref.functionName).toBe("testFunction");
            expect(ref.placeholder).toBe("${TestFunctionArn}");
            expect(ref.required).toBe(true);
        });

        test("should create optional Lambda function reference", () => {
            const ref = createLambdaFunctionRef("optionalFunction", "${OptionalArn}", false);

            expect(ref.functionName).toBe("optionalFunction");
            expect(ref.placeholder).toBe("${OptionalArn}");
            expect(ref.required).toBe(false);
        });
    });

    describe("createRetryConfig", () => {
        test("should create retry configuration with defaults", () => {
            const config = createRetryConfig();

            expect(config.maxAttempts).toBe(3);
            expect(config.backoffRate).toBe(2.0);
            expect(config.intervalSeconds).toBe(2);
        });

        test("should create retry configuration with custom values", () => {
            const config = createRetryConfig(5, 1.5, 10);

            expect(config.maxAttempts).toBe(5);
            expect(config.backoffRate).toBe(1.5);
            expect(config.intervalSeconds).toBe(10);
        });

        test("should throw error for invalid maxAttempts", () => {
            expect(() => createRetryConfig(0, 2.0, 2)).toThrow(
                "retry config maxAttempts must be a positive integer",
            );
            expect(() => createRetryConfig(-1, 2.0, 2)).toThrow(
                "retry config maxAttempts must be a positive integer",
            );
            expect(() => createRetryConfig(1.5, 2.0, 2)).toThrow(
                "retry config maxAttempts must be a positive integer",
            );
        });

        test("should throw error for invalid backoffRate", () => {
            expect(() => createRetryConfig(3, 0, 2)).toThrow(
                "retry config backoffRate must be a positive number",
            );
            expect(() => createRetryConfig(3, -1, 2)).toThrow(
                "retry config backoffRate must be a positive number",
            );
        });

        test("should throw error for invalid intervalSeconds", () => {
            expect(() => createRetryConfig(3, 2.0, 0)).toThrow(
                "retry config intervalSeconds must be a positive integer",
            );
            expect(() => createRetryConfig(3, 2.0, -1)).toThrow(
                "retry config intervalSeconds must be a positive integer",
            );
            expect(() => createRetryConfig(3, 2.0, 1.5)).toThrow(
                "retry config intervalSeconds must be a positive integer",
            );
        });
    });

    describe("createErrorHandlingConfig", () => {
        test("should create error handling configuration with defaults", () => {
            const config = createErrorHandlingConfig();

            expect(config.catchAll).toBe(true);
            expect(config.customErrorStates).toBeUndefined();
        });

        test("should create error handling configuration with custom states", () => {
            const customStates = {
                CustomError: "HandleCustomError",
                AnotherError: "HandleAnotherError",
            };

            const config = createErrorHandlingConfig(false, customStates);

            expect(config.catchAll).toBe(false);
            expect(config.customErrorStates).toBe(customStates);
        });
    });

    describe("createStandardErrorHandling", () => {
        test("should create standard error handling with service errors", () => {
            const config = createStandardErrorHandling(true);

            expect(config.catchAll).toBe(true);
            expect(config.customErrorStates).toBeDefined();
            expect(config.customErrorStates!["States.TaskFailed"]).toBe("HandleTaskFailure");
            expect(config.customErrorStates!["Lambda.ServiceException"]).toBe(
                "HandleLambdaServiceError",
            );
            expect(config.customErrorStates!["DynamoDB.ServiceException"]).toBe(
                "HandleDynamoDBError",
            );
        });

        test("should create standard error handling without service errors", () => {
            const config = createStandardErrorHandling(false);

            expect(config.catchAll).toBe(true);
            expect(config.customErrorStates).toEqual({});
        });
    });

    describe("createWorkflowWithDefaults", () => {
        test("should create workflow with sensible defaults", () => {
            const lambdaFunctions = {
                step1: createLambdaFunctionRef("function1", "${Function1Arn}"),
            };

            const config = createWorkflowWithDefaults(
                "DefaultWorkflow",
                "Workflow with defaults",
                lambdaFunctions,
            );

            expect(config.name).toBe("DefaultWorkflow");
            expect(config.description).toBe("Workflow with defaults");
            expect(config.definitionPath).toBe("default-workflow/definition.asl.json");
            expect(config.lambdaFunctions).toBe(lambdaFunctions);
            expect(config.timeout).toEqual(Duration.minutes(15));
            expect(config.retryConfig).toBeDefined();
            expect(config.errorHandling).toBeDefined();
            expect(config.errorHandling!.catchAll).toBe(true);
        });

        test("should override defaults with provided options", () => {
            const lambdaFunctions = {
                step1: createLambdaFunctionRef("function1", "${Function1Arn}"),
            };
            const customTimeout = Duration.hours(1);
            const customRetry = createRetryConfig(10, 3.0, 5);

            const config = createWorkflowWithDefaults(
                "CustomDefaultWorkflow",
                "Custom workflow",
                lambdaFunctions,
                {
                    timeout: customTimeout,
                    retryConfig: customRetry,
                    definitionPath: "custom/definition.asl.json",
                },
            );

            expect(config.timeout).toBe(customTimeout);
            expect(config.retryConfig).toBe(customRetry);
            expect(config.definitionPath).toBe("custom/definition.asl.json");
        });
    });

    describe("validateWorkflowConfig", () => {
        test("should validate valid workflow configuration", () => {
            const validConfig: WorkflowConfig = {
                name: "ValidWorkflow",
                description: "A valid workflow configuration",
                definitionPath: "valid/definition.asl.json",
                lambdaFunctions: {
                    step1: createLambdaFunctionRef("function1", "${Function1Arn}"),
                },
            };

            expect(() => validateWorkflowConfig(validConfig)).not.toThrow();
        });

        test("should throw error for missing name", () => {
            const invalidConfig: WorkflowConfig = {
                name: "",
                description: "Valid description",
                definitionPath: "valid/definition.asl.json",
                lambdaFunctions: {},
            };

            expect(() => validateWorkflowConfig(invalidConfig)).toThrow(
                "must have a non-empty name",
            );
        });

        test("should throw error for missing description", () => {
            const invalidConfig: WorkflowConfig = {
                name: "ValidName",
                description: "",
                definitionPath: "valid/definition.asl.json",
                lambdaFunctions: {},
            };

            expect(() => validateWorkflowConfig(invalidConfig)).toThrow(
                "must have a non-empty description",
            );
        });

        test("should throw error for missing definition path", () => {
            const invalidConfig: WorkflowConfig = {
                name: "ValidName",
                description: "Valid description",
                definitionPath: "",
                lambdaFunctions: {},
            };

            expect(() => validateWorkflowConfig(invalidConfig)).toThrow(
                "must have a non-empty definitionPath",
            );
        });

        test("should validate retry configuration if present", () => {
            const invalidConfig: WorkflowConfig = {
                name: "ValidName",
                description: "Valid description",
                definitionPath: "valid/definition.asl.json",
                lambdaFunctions: {},
                retryConfig: {
                    maxAttempts: 0,
                    backoffRate: 2.0,
                    intervalSeconds: 2,
                },
            };

            expect(() => validateWorkflowConfig(invalidConfig)).toThrow(
                "maxAttempts must be a positive integer",
            );
        });
    });

    describe("validateLambdaFunctionRef", () => {
        test("should validate valid Lambda function reference", () => {
            const validRef: LambdaFunctionRef = {
                functionName: "validFunction",
                placeholder: "${ValidArn}",
                required: true,
            };

            expect(() =>
                validateLambdaFunctionRef("TestWorkflow", "step1", validRef),
            ).not.toThrow();
        });

        test("should throw error for missing function name", () => {
            const invalidRef: LambdaFunctionRef = {
                functionName: "",
                placeholder: "${ValidArn}",
                required: true,
            };

            expect(() => validateLambdaFunctionRef("TestWorkflow", "step1", invalidRef)).toThrow(
                "must have a non-empty functionName",
            );
        });

        test("should throw error for missing placeholder", () => {
            const invalidRef: LambdaFunctionRef = {
                functionName: "validFunction",
                placeholder: "",
                required: true,
            };

            expect(() => validateLambdaFunctionRef("TestWorkflow", "step1", invalidRef)).toThrow(
                "must have a non-empty placeholder",
            );
        });

        test("should throw error for invalid required field", () => {
            const invalidRef: any = {
                functionName: "validFunction",
                placeholder: "${ValidArn}",
                required: "true", // Should be boolean
            };

            expect(() => validateLambdaFunctionRef("TestWorkflow", "step1", invalidRef)).toThrow(
                "required field must be a boolean",
            );
        });
    });

    describe("validateRetryConfigObject", () => {
        test("should validate valid retry configuration", () => {
            const validConfig: RetryConfig = {
                maxAttempts: 3,
                backoffRate: 2.0,
                intervalSeconds: 2,
            };

            expect(() => validateRetryConfigObject("TestWorkflow", validConfig)).not.toThrow();
        });

        test("should throw error for invalid retry configuration", () => {
            const invalidConfig: RetryConfig = {
                maxAttempts: 0,
                backoffRate: 2.0,
                intervalSeconds: 2,
            };

            expect(() => validateRetryConfigObject("TestWorkflow", invalidConfig)).toThrow(
                "maxAttempts must be a positive integer",
            );
        });
    });

    describe("validateErrorHandlingConfig", () => {
        test("should validate valid error handling configuration", () => {
            const validConfig: ErrorHandlingConfig = {
                catchAll: true,
                customErrorStates: {
                    CustomError: "HandleCustomError",
                },
            };

            expect(() => validateErrorHandlingConfig("TestWorkflow", validConfig)).not.toThrow();
        });

        test("should throw error for invalid catchAll field", () => {
            const invalidConfig: any = {
                catchAll: "true", // Should be boolean
            };

            expect(() => validateErrorHandlingConfig("TestWorkflow", invalidConfig)).toThrow(
                "catchAll must be a boolean",
            );
        });

        test("should throw error for invalid custom error states", () => {
            const invalidConfig: ErrorHandlingConfig = {
                catchAll: true,
                customErrorStates: {
                    "": "ValidState", // Empty error type
                },
            };

            expect(() => validateErrorHandlingConfig("TestWorkflow", invalidConfig)).toThrow(
                "customErrorStates keys must be non-empty strings",
            );
        });
    });

    describe("validateWorkflowConfigs", () => {
        test("should validate multiple workflow configurations", () => {
            const validConfig: WorkflowConfig = {
                name: "ValidWorkflow",
                description: "Valid workflow",
                definitionPath: "valid/definition.asl.json",
                lambdaFunctions: {
                    step1: createLambdaFunctionRef("function1", "${Function1Arn}"),
                },
            };

            const invalidConfig: WorkflowConfig = {
                name: "",
                description: "Invalid workflow",
                definitionPath: "invalid/definition.asl.json",
                lambdaFunctions: {},
            };

            const results = validateWorkflowConfigs([validConfig, invalidConfig]);

            expect(results).toHaveLength(2);
            expect(results[0].isValid).toBe(true);
            expect(results[0].error).toBeUndefined();
            expect(results[1].isValid).toBe(false);
            expect(results[1].error).toContain("must have a non-empty name");
        });
    });
});
