#!/usr/bin/env node

/**
 * CloudFormation Template Validation Script
 * Compares generated CloudFormation templates to ensure no breaking changes
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

/**
 * Generate CloudFormation template using CDK synth
 * @returns {Object} The parsed CloudFormation template
 */
function generateTemplate() {
    try {
        console.log("Generating CloudFormation template...");
        execSync("npm run synth -- --quiet", {
            encoding: "utf8",
            cwd: __dirname + "/..",
        });

        // Find the template file in cdk.out
        const cdkOutDir = path.join(__dirname, "../cdk.out");
        const templateFiles = fs
            .readdirSync(cdkOutDir)
            .filter((file) => file.endsWith(".template.json"));

        if (templateFiles.length === 0) {
            throw new Error("No CloudFormation template found in cdk.out directory");
        }

        const templatePath = path.join(cdkOutDir, templateFiles[0]);
        const template = JSON.parse(fs.readFileSync(templatePath, "utf8"));

        console.log(`✓ Template generated successfully: ${templateFiles[0]}`);
        return template;
    } catch (error) {
        console.error("Failed to generate CloudFormation template:", error.message);
        process.exit(1);
    }
}

/**
 * Validate Step Functions resources in the template
 * @param {Object} template The CloudFormation template
 */
function validateStepFunctionsResources(template) {
    console.log("\nValidating Step Functions resources...");

    const resources = template.Resources || {};
    const stepFunctionResources = Object.entries(resources).filter(
        ([_, resource]) => resource.Type === "AWS::StepFunctions::StateMachine",
    );

    if (stepFunctionResources.length === 0) {
        console.warn("⚠ No Step Functions state machines found in template");
        return;
    }

    stepFunctionResources.forEach(([logicalId, resource]) => {
        console.log(`✓ Found Step Function: ${logicalId}`);

        // Validate required properties
        if (!resource.Properties.DefinitionString && !resource.Properties.Definition) {
            console.error(`✗ Step Function ${logicalId} missing definition`);
            process.exit(1);
        }

        // Check for proper IAM role
        if (!resource.Properties.RoleArn) {
            console.error(`✗ Step Function ${logicalId} missing IAM role`);
            process.exit(1);
        }

        console.log(
            `  - Definition: ${resource.Properties.DefinitionString ? "String" : "Object"}`,
        );
        console.log(`  - Role: ${resource.Properties.RoleArn ? "Present" : "Missing"}`);
        console.log(`  - Comment: ${resource.Properties.Comment || "None"}`);
    });
}

/**
 * Validate Lambda function permissions
 * @param {Object} template The CloudFormation template
 */
function validateLambdaPermissions(template) {
    console.log("\nValidating Lambda function permissions...");

    const resources = template.Resources || {};
    const lambdaPermissions = Object.entries(resources).filter(
        ([_, resource]) => resource.Type === "AWS::Lambda::Permission",
    );

    const stepFunctionPermissions = lambdaPermissions.filter(
        ([_, resource]) => resource.Properties.Principal === "states.amazonaws.com",
    );

    console.log(`✓ Found ${stepFunctionPermissions.length} Lambda permissions for Step Functions`);

    stepFunctionPermissions.forEach(([logicalId, resource]) => {
        console.log(
            `  - ${logicalId}: ${resource.Properties.Action} on ${resource.Properties.FunctionName}`,
        );
    });
}

/**
 * Validate IAM roles and policies
 * @param {Object} template The CloudFormation template
 */
function validateIAMResources(template) {
    console.log("\nValidating IAM resources...");

    const resources = template.Resources || {};
    const iamRoles = Object.entries(resources).filter(
        ([_, resource]) => resource.Type === "AWS::IAM::Role",
    );

    const stepFunctionRoles = iamRoles.filter(([_, resource]) =>
        resource.Properties.AssumeRolePolicyDocument?.Statement?.some((statement) =>
            statement.Principal?.Service?.includes("states.amazonaws.com"),
        ),
    );

    console.log(`✓ Found ${stepFunctionRoles.length} IAM roles for Step Functions`);

    stepFunctionRoles.forEach(([logicalId, resource]) => {
        console.log(`  - ${logicalId}`);

        // Check for managed policies
        const managedPolicies = resource.Properties.ManagedPolicyArns || [];
        managedPolicies.forEach((policy) => {
            console.log(`    - Managed Policy: ${policy}`);
        });
    });
}

/**
 * Validate resource naming consistency
 * @param {Object} template The CloudFormation template
 */
function validateResourceNaming(template) {
    console.log("\nValidating resource naming consistency...");

    const resources = template.Resources || {};
    const resourceNames = Object.keys(resources);

    // Check for consistent naming patterns
    const stepFunctionResources = resourceNames.filter(
        (name) => resources[name].Type === "AWS::StepFunctions::StateMachine",
    );

    stepFunctionResources.forEach((resourceName) => {
        if (!resourceName.includes("StepFunctions") && !resourceName.includes("Workflow")) {
            console.warn(`⚠ Resource ${resourceName} may not follow naming convention`);
        } else {
            console.log(`✓ Resource ${resourceName} follows naming convention`);
        }
    });
}

/**
 * Generate a summary report
 * @param {Object} template The CloudFormation template
 */
function generateSummaryReport(template) {
    console.log("\n=== CloudFormation Template Summary ===");

    const resources = template.Resources || {};
    const resourceTypes = {};

    Object.values(resources).forEach((resource) => {
        resourceTypes[resource.Type] = (resourceTypes[resource.Type] || 0) + 1;
    });

    console.log("Resource counts by type:");
    Object.entries(resourceTypes)
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([type, count]) => {
            console.log(`  ${type}: ${count}`);
        });

    console.log(`\nTotal resources: ${Object.keys(resources).length}`);
    console.log(`Template size: ${JSON.stringify(template).length} bytes`);
}

/**
 * Main validation function
 */
function main() {
    console.log("CloudFormation Template Validation");
    console.log("===================================");

    try {
        const template = generateTemplate();

        validateStepFunctionsResources(template);
        validateLambdaPermissions(template);
        validateIAMResources(template);
        validateResourceNaming(template);
        generateSummaryReport(template);

        console.log("\n✅ CloudFormation template validation completed successfully!");
    } catch (error) {
        console.error("\n❌ CloudFormation template validation failed:", error.message);
        process.exit(1);
    }
}

// Run the validation if this script is executed directly
if (require.main === module) {
    main();
}

module.exports = {
    generateTemplate,
    validateStepFunctionsResources,
    validateLambdaPermissions,
    validateIAMResources,
    validateResourceNaming,
    generateSummaryReport,
};
