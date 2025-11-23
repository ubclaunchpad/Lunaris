FROM public.ecr.aws/lambda/nodejs:22 AS deps
ARG NPM_VERSION=11

WORKDIR /app

RUN npm install -g npm@${NPM_VERSION}

COPY package.json package-lock.json ./
COPY lambda/package.json lambda/tsconfig.json ./lambda/

RUN --mount=type=cache,target=/root/.npm \
    npm install --omit=dev --workspace=lambda

FROM public.ecr.aws/lambda/nodejs:22 AS builder
ARG NPM_VERSION=11

WORKDIR /app

RUN npm install -g npm@${NPM_VERSION}

COPY package.json package-lock.json ./
COPY lambda/package.json lambda/tsconfig.json ./lambda/
COPY lambda/src/ ./lambda/src/

RUN --mount=type=cache,target=/root/.npm \
    npm install --workspace=lambda

WORKDIR /app/lambda
RUN npm run build

FROM public.ecr.aws/lambda/nodejs:22 AS runtime

WORKDIR ${LAMBDA_TASK_ROOT}

COPY --from=builder /app/lambda/dist ./
COPY --from=builder /app/lambda/package.json ./
COPY --from=deps /app/node_modules ./node_modules

# Set the CMD to your handler                                                                               │
# This can be overridden when running the container or via SAM template                                     │
# Format: <file-path>.<handler-function>                                                                    │
# Example handlers:                                                                         │
#   - handlers/deployInstance.handler                                                                       │
#   - handlers/terminateInstance.handler                                                                    │
#   - handlers/streamingLink.handler                                                                        │
#   - handlers/user-deploy-ec2/check-running-streams.handler                                                │
#   - handlers/user-deploy-ec2/deploy-ec2.handler                                                           │
#   - handlers/user-deploy-ec2/update-running-streams.handler                                               │
 CMD ["handlers/deployInstance.handler"]       