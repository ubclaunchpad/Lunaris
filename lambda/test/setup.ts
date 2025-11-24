// Jest setup file for Lambda package tests
import { afterAll, afterEach, beforeAll, beforeEach, jest } from "@jest/globals";

// Suppress expected console.error output from error handling tests
const originalError = console.error;
beforeAll(() => {
    console.error = (...args: any[]) => {
        if (args[0]?.includes?.("Error querying items by userId")) return;
        originalError(...args);
    };
});

afterAll(() => {
    console.error = originalError;
});

// Global test setup
beforeEach(() => {
    // Reset all AWS SDK mocks before each test
    jest.clearAllMocks();
});

// Global test teardown
afterEach(() => {
    // Clean up any remaining mocks
    jest.restoreAllMocks();
});

// Configure Jest timeout for async operations
jest.setTimeout(10000);
