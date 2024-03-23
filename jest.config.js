module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.+(ts|tsx|js)'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  snapshotResolver: './jest-config/resolver.js',
  setupFilesAfterEnv: ['./jest-config/setup.ts'],
  watchPathIgnorePatterns: ['<rootDir>/test/', '<rootDir>/test copy/']
};