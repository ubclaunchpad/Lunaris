# Lunaris

A monorepo containing AWS CDK infrastructure and reusable AWS constructs for Lunaris.

## Repository Structure

```
├── packages/
│   ├── aws-constructs/     # Reusable AWS constructs package (to be created)
│   └── cdk/               # CDK infrastructure package
├── frontend/              # Next.js frontend application
├── lambda/                # Lambda function source code
├── stepfunctions/         # Step Functions definitions and handlers
├── package.json           # Root package.json with workspace configuration
├── tsconfig.json          # Shared TypeScript configuration
└── jest.config.js         # Shared Jest configuration
```

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm >= 8.0.0
- AWS CLI configured
- AWS CDK CLI installed globally

### Installation

```bash
# Install all dependencies for all packages
npm install

# Build all packages
npm run build

# Run all tests
npm run test
```

### Development Workflow

```bash
# Build all packages
npm run build

# Run tests for all packages
npm run test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run tests with coverage
npm run test:coverage

# Clean all build artifacts
npm run clean

# Type check all packages
npm run typecheck

# Lint all packages
npm run lint
```

### CDK Commands

```bash
# Deploy CDK stack
npm run cdk:deploy

# Synthesize CDK template
npm run cdk:synth

# Show CDK diff
npm run cdk:diff
```

## Packages

### @lunaris/cdk

The main CDK infrastructure package that defines and deploys AWS resources.

### @lunaris/aws-constructs

A package containing reusable AWS construct definitions.

## Lambda Functions

Lambda function source code is located in the `lambda/` directory and is shared across packages.

## Step Functions

Step Function definitions and their Lambda handlers are located in the `stepfunctions/` directory.

## Testing

The monorepo uses Jest for testing with separate test configurations for each package:

- **aws-constructs**: Unit tests for construct behavior
- **cdk**: Integration tests for CDK stacks
- **lambda**: Unit tests for Lambda function logic
- **stepfunctions**: Tests for Step Function definitions and handlers

## Contributing

1. Make changes in the appropriate package
2. Run tests to ensure everything works
3. Build all packages to verify compatibility
4. Submit a pull request