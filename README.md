# Lunaris

A cloud gaming platform built with AWS serverless architecture.

## Architecture

This project consists of:

- **Frontend**: Next.js application for the user interface
- **Lambda**: AWS Lambda functions for serverless backend logic
- **CDK**: Infrastructure as Code using AWS CDK

## Prerequisites

- **Node.js** 22.x or higher
- **npm** 9.x or higher
- **Docker Desktop** (for local Lambda testing)
- **AWS SAM CLI** (for local API Gateway simulation)
- **AWS CLI** (for deployment)

### Installing Docker Desktop

```bash
# Homebrew
brew install --cask docker

# Then start Docker Desktop
open -a Docker
```

### Installing AWS SAM CLI

```bash
# macOS (Homebrew)
brew install aws-sam-cli

# Verify installation
sam --version
```

# Setup

### 1. Install Dependencies

```bash
# From project root

# Install all project dependencies 
npm run install:all
```

### 2. Build All Project Code

```bash
# From project root

# Build all Docker images
npm run docker:build

# Start all services (DynamoDB + Lambda + Frontend)
npm run docker:start

# View logs from all services
npm run docker:logs

# Stop all services
npm run docker:stop

# Remove volumes and containers)
npm run docker:clean
```


#### What's Running?

Once started, you'll have:

| Service | Port | URL | Purpose |
|---------|------|-----|---------|
| **DynamoDB Local** | 8000 | http://localhost:8000 | Local DynamoDB for testing |
| **Lambda Container** | 9000 | http://localhost:9000 | Lambda Runtime Interface Emulator |
| **Frontend** | 3000 | http://localhost:3000 | Next.js production build |

#### Running Specific Lambda Handlers

```bash
# Run all containers, default handler for lambda (deployInstance)
npm run docker:run

# Or specify a different handler w/ format
docker run --rm -p 9000:8080 lunaris-lambda handlers/streamingLink.handler
docker run --rm -p 9000:8080 lunaris-lambda handlers/terminateInstance.handler
docker run --rm -p 9000:8080 lunaris-lambda handlers/user-deploy-ec2/check-running-streams.handler
```

#### Test Lambda Function

```bash
# In another terminal or Postman, invoke the Lambda
curl -X POST "http://localhost:9000/2015-03-31/functions/function/invocations" \
  -d '{"userId":"test-user","instanceType":"g4dn.xlarge","region":"us-west-2"}'
```


#### Testing the Stack

```bash
# Test Lambda function
curl -X POST "http://localhost:9000/2015-03-31/functions/function/invocations" \
  -d '{"userId":"test-user","instanceType":"g4dn.xlarge","region":"us-west-2"}'

# Test Frontend
open http://localhost:3000

# Test DynamoDB connection
aws dynamodb list-tables --endpoint-url http://localhost:8000
```


# Local Development with SAM

SAM Local provides a local API Gateway + Lambda environment:

```bash
# From project root after building...

# Start local API Gateway
sam local start-api
```

Then test endpoints:
```bash
# Deploy Instance
curl -X POST http://localhost:3000/deployInstance \
  -H "Content-Type: application/json" \
  -d '{"userId":"user123","instanceType":"g4dn.xlarge","region":"us-west-2"}'

# Get Streaming Link
curl "http://localhost:3000/streamingLink?userId=user123"

# Terminate Instance
curl -X POST http://localhost:3000/terminateInstance \
  -H "Content-Type: application/json" \
  -d '{"instanceId":"i-1234567890abcdef0","userId":"user123"}'
```