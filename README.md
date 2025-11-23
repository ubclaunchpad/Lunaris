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

#### MacOS

```bash
# Mac OS (Homebrew)
brew install --cask docker

# Then start Docker Desktop
open -a Docker

--------------------------------

# Windows
- Download Docker Desktop from the official site: https://www.docker.com/products/docker-desktop/
- Open Docker desktop to start the environment
```

### Docker Compose Version Compatibility

**⚠️ Important:** This project uses `docker-compose` (with hyphen) commands. Docker Desktop may come with Docker Compose v2, which uses `docker compose` (with space) instead.

If you encounter a `docker-compose: command not found` error, you have two options:

#### Option 1: Install Standalone docker-compose 

Install the standalone `docker-compose` binary to match the project scripts:

```bash
# macOS (Homebrew)
brew install docker-compose

# Or download directly (macOS/Linux)
# $(uname -s) returns your OS name (e.g., "Darwin" for macOS, "Linux" for Linux)
# $(uname -m) returns your machine architecture (e.g., "x86_64", "arm64")
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify installation
docker-compose --version
```

#### Option 2: Create an Alias

If you prefer to use Docker Compose v2 (`docker compose`), add this alias to your shell config:

```bash
# Add to ~/.zshrc (macOS) or ~/.bashrc (Linux)
alias docker-compose='docker compose'
```

Then reload your shell:
```bash
source ~/.zshrc  # or source ~/.bashrc
```

#### Check Your Docker Compose Version

```bash
# Check if you have Docker Compose v2 (plugin)
docker compose version

# Check if you have standalone docker-compose
docker-compose --version
```

### Installing AWS SAM CLI

```bash
# macOS (Homebrew)
brew install aws-sam-cli

# Windows (Pip)
pip install --upgrade aws-sam-cli

# Verify installation
sam --version

```

# Quick Start

Get the entire local development stack running with one command:

```bash
# Install dependencies first (one-time setup)
npm run install:all

# Start everything: Docker services + DynamoDB tables
npm run dev:start

# Stop everything
npm run dev:stop
```

That's it! Your local environment is ready with:

| Service                             | Port | URL                   |
| ----------------------------------- | ---- | --------------------- |
| **DynamoDB Local (w/ tables init)** | 8000 | http://localhost:8000 |
| **Lambda Container**                | 9000 | http://localhost:9000 |
| **Frontend**                        | 3000 | http://localhost:3000 |

## Lambda Handler Management

### Understanding Lambda Handlers

The Lambda container only runs **ONE handler at a time** on port 9000 because each emulator needs its own port. Although you can easily switch between handlers by restarting the container.

### Available Handlers

| Handler                    | Path                                                      |
| -------------------------- | --------------------------------------------------------- |
| **deployInstance**         | `handlers/deployInstance.handler`                         |
| **terminateInstance**      | `handlers/terminateInstance.handler`                      |
| **streamingLink**          | `handlers/streamingLink.handler`                          |
| **check-running-streams**  | `handlers/user-deploy-ec2/check-running-streams.handler`  |
| **deploy-ec2**             | `handlers/user-deploy-ec2/deploy-ec2.handler`             |
| **update-running-streams** | `handlers/user-deploy-ec2/update-running-streams.handler` |

### How to Switch Lambda Handlers

To test a different handler, stop the Lambda container and restart it with the desired handler:

```bash
# Stop the Lambda container
docker-compose stop lambda

# Restart with a different handler (e.g., streamingLink)
docker-compose run --rm -p 9000:8080 lambda handlers/streamingLink.handler
```

**Note:** The Lambda image must be built first (`npm run docker:build`)

### Testing Lambda Handlers Example

Each handler expects different inputs. Here is one example using the dockerized lambda:

#### Test deployInstance Handler (Default)

```bash
curl -X POST "http://localhost:9000/2015-03-31/functions/function/invocations" \
  -H "Content-Type: application/json" \
  -d '{
    "body": "{\"userId\":\"test-user\",\"instanceType\":\"t3.micro\",\"amiId\":\"ami-12345678\"}"
  }'
```

### Testing Other Services

```bash
# Test Frontend
open http://localhost:3000

# Test DynamoDB connection
aws dynamodb list-tables --endpoint-url http://localhost:8000

# View all container logs
npm run docker:logs
```

### Lambda Unit Tests

Control Plane handlers rely on Jest plus `aws-sdk-client-mock` and can be exercised directly from the Lambda workspace.

```bash
# Install all workspaces once from the repo root
npm run install:all

# Then run tests inside the lambda package
cd lambda
npm test                     # full unit-test suite
npm run test:watch           # persistent watch mode
npm run test:coverage        # generates coverage/ & HTML report
```

The coverage command writes reports to `lambda/coverage` (HTML view in `coverage/lcov-report/index.html`). Run these scripts from inside the `lambda` workspace or prefix them with `npm --prefix lambda run …` if you prefer staying at the repo root.

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

# Formatting and Linting

The CI pipeline enforces formatting and linting checks on all pull requests.
Before pushing, run the relevant `prettier` and `lint` commands locally to ensure your code passes these checks.

### Prettier (Formatting)

Running Prettier on the entire project:

```bash
# Checks for prettier formatting issues (no changes applied)
npm run prettier
# Fixes formatting issues
npm run prettier:fix
```

Run Prettier on specific folders:

```bash
# Checks
npm run prettier:frontend
npm run prettier:cdk
npm run prettier:lambda
# Fixes
npm run prettier:frontend:fix
npm run prettier:cdk:fix
npm run prettier:lambda:fix
```

### ESLint (Linting)

Running ESLint on the entire project:

```bash
# Checks for lint issues (no changes applied)
npm run lint
# Fixes lint issues (if possible)
npm run lint:fix
```

Run ESLint for specific folders:

```bash
# Checks
npm run lint:frontend
npm run lint:cdk
npm run lint:lambda
# Fixes
npm run lint:frontend:fix
npm run lint:cdk:fix
npm run lint:lambda:fix
```

### For VS Code users:

It’s recommended to install the following extensions:

- `Prettier - Code Formatter` — enables auto-formatting on save (may have to enable this feature in settings)
- `ESLint` — integrates lint rules directly in the IDE, showing warnings and errors in real time
