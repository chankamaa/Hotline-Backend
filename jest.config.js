// Jest Configuration for Hotline Backend

export default {
  // Use Node.js test environment
  testEnvironment: "node",
  
  // Test file patterns
  testMatch: [
    "**/tests/**/*.test.js",
    "**/tests/**/*.spec.js",
  ],
  
  // Setup files (none currently)
  
  // Coverage configuration
  collectCoverageFrom: [
    "src/**/*.js",
    "!src/seed/**",
    "!src/server.js",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
  
  // Timeout for async tests
  testTimeout: 30000,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Verbose output
  verbose: true,
  
  // Force exit after tests complete
  forceExit: true,
  
  // Detect open handles
  detectOpenHandles: true,
};
