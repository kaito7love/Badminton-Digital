module.exports = {
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      // Không cần babel — code là CommonJS thuần; transform làm chậm đo hiệu năng.
      transform: {},
      testMatch: ['<rootDir>/tests/unit/**/*.test.js']
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      transform: {},
      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
      globalSetup: '<rootDir>/tests/integration/globalSetup.js',
      setupFilesAfterEnv: ['<rootDir>/tests/integration/setup.js']
    }
  ]
};
