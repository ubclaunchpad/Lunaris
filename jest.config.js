module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  projects: [
    {
      displayName: 'aws-constructs',
      testMatch: ['<rootDir>/packages/aws-constructs/**/*.test.ts'],
      preset: 'ts-jest',
      testEnvironment: 'node',
      collectCoverageFrom: [
        'packages/aws-constructs/src/**/*.ts',
        '!packages/aws-constructs/src/**/*.d.ts',
      ],
    },
    {
      displayName: 'cdk',
      testMatch: ['<rootDir>/packages/cdk/**/*.test.ts'],
      preset: 'ts-jest',
      testEnvironment: 'node',
      collectCoverageFrom: [
        'packages/cdk/lib/**/*.ts',
        '!packages/cdk/lib/**/*.d.ts',
      ],
    },
    {
      displayName: 'lambda',
      testMatch: ['<rootDir>/lambda/**/*.test.ts'],
      preset: 'ts-jest',
      testEnvironment: 'node',
      collectCoverageFrom: [
        'lambda/**/*.ts',
        '!lambda/**/*.d.ts',
      ],
    },
    {
      displayName: 'stepfunctions',
      testMatch: ['<rootDir>/stepfunctions/**/*.test.ts'],
      preset: 'ts-jest',
      testEnvironment: 'node',
      collectCoverageFrom: [
        'stepfunctions/**/*.ts',
        '!stepfunctions/**/*.d.ts',
      ],
    },
  ],
  collectCoverageFrom: [
    'packages/*/src/**/*.ts',
    'packages/*/lib/**/*.ts',
    'lambda/**/*.ts',
    'stepfunctions/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/dist/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
};