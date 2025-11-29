ARG NODE_VERSION=22
FROM node:${NODE_VERSION} AS base

WORKDIR /app

ARG NPM_VERSION=11
RUN npm install -g npm@${NPM_VERSION}

FROM base AS deps_local

WORKDIR /app/frontend

COPY frontend/package.json .
COPY frontend/package-lock.json .

RUN --mount=type=cache,target=/root/.npm \
    npm ci

FROM base AS build

WORKDIR /app/frontend

COPY --from=deps_local /app/frontend/node_modules ./node_modules

COPY frontend/package.json .
COPY frontend/package-lock.json .
COPY frontend/ ./

RUN npm run build

FROM base AS final

ENV NODE_ENV=production

USER node

WORKDIR /app/frontend

COPY --chown=node:node frontend/package.json .
COPY --chown=node:node --from=build /app/frontend/node_modules ./node_modules
COPY --chown=node:node --from=build /app/frontend/.next ./.next
COPY --chown=node:node --from=build /app/frontend/public ./public

EXPOSE 3000
CMD ["npm", "start"]