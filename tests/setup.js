// Test Setup File
// Runs before all tests

import mongoose from "mongoose";
import dotenv from "dotenv";

// Load test environment
dotenv.config({ path: ".env.test" });

// Global timeout for tests
jest.setTimeout(30000);

// Connect to test database before all tests
beforeAll(async () => {
  const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/hotline_test";
  
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("📗 Connected to test database");
  } catch (error) {
    console.error("❌ Test database connection failed:", error.message);
    process.exit(1);
  }
});

// Clean up after all tests
afterAll(async () => {
  try {
    // Drop test database
    if (mongoose.connection.db) {
      await mongoose.connection.db.dropDatabase();
    }
    await mongoose.connection.close();
    console.log("📕 Test database connection closed");
  } catch (error) {
    console.error("Error closing test database:", error.message);
  }
});

// Clean collections between tests (optional - for isolation)
afterEach(async () => {
  // Uncomment to clear collections after each test
  // const collections = mongoose.connection.collections;
  // for (const key in collections) {
  //   await collections[key].deleteMany({});
  // }
});
