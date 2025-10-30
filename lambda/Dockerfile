FROM public.ecr.aws/lambda/nodejs:22 AS deps
WORKDIR ${LAMBDA_TASK_ROOT}

COPY package.json package-lock.json  ./

RUN npm ci --omit=dev --ignore-scripts

FROM public.ecr.aws/lambda/nodejs:22 AS runtime          
WORKDIR ${LAMBDA_TASK_ROOT}
COPY --from=deps ${LAMBDA_TASK_ROOT}/node_modules ./node_modules

COPY dist/ ./
COPY package.json ./

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