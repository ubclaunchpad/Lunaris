import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

type EnvOverrides = Record<string, string | undefined>;

type RestoreEnvFn = () => void;

export const dynamoMock = mockClient(DynamoDBDocumentClient);

/**
 * Applies the provided environment overrides and returns a function that
 * restores each key to its original value. Use this inside `beforeEach`/`afterEach`
 * when tests need to mutate `process.env`.
 */
export const withEnv = (overrides: EnvOverrides): RestoreEnvFn => {
    const originals: Record<string, string | undefined> = {};

    Object.entries(overrides).forEach(([key, value]) => {
        originals[key] = process.env[key];

        if (value === undefined || value === null) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    });

    return () => {
        Object.entries(originals).forEach(([key, originalValue]) => {
            if (originalValue === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = originalValue;
            }
        });
    };
};

/**
 * Convenience helper that ensures RUNNING_STREAMS_TABLE_NAME is set for a test.
 */
export const ensureStreamsTableEnv = (tableName = "test-running-streams"): RestoreEnvFn =>
    withEnv({ RUNNING_STREAMS_TABLE_NAME: tableName });
