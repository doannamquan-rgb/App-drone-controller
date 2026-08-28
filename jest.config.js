module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '^react-native$': '<rootDir>/src/services/update/__tests__/__mocks__/react-native.js',
    '^react-native-get-random-values$': '<rootDir>/src/services/update/__tests__/__mocks__/react-native-get-random-values.js',
    '^uuid$': '<rootDir>/src/services/update/__tests__/__mocks__/uuid.js',
  },
};
