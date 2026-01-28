// Integration Tests for Auth API Endpoints

import request from "supertest";
import app from "../../src/app.js";
import User from "../../src/models/user/userModel.js";
import Role from "../../src/models/user/roleModel.js";

describe("Auth API", () => {
  let testRole;
  
  beforeAll(async () => {
    // Create a test role
    testRole = await Role.create({
      name: "TestRole",
      description: "Test role for integration tests",
      permissions: [],
    });
  });
  
  afterAll(async () => {
    // Clean up test data
    await User.deleteMany({ username: /^testuser/ });
    await Role.deleteOne({ _id: testRole._id });
  });
  
  describe("POST /api/v1/auth/register", () => {
    it("should register a new user", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({
          username: "testuser_register",
          email: "testuser@test.com",
          password: "TestPassword123!",
          passwordConfirm: "TestPassword123!",
          roles: [testRole._id],
        });
      
      expect(res.status).toBe(201);
      expect(res.body.status).toBe("success");
      expect(res.body.data).toHaveProperty("user");
      expect(res.body.data.user.username).toBe("testuser_register");
    });
    
    it("should reject duplicate username", async () => {
      // First registration
      await request(app)
        .post("/api/v1/auth/register")
        .send({
          username: "testuser_dup",
          email: "testdup1@test.com",
          password: "TestPassword123!",
          passwordConfirm: "TestPassword123!",
          roles: [testRole._id],
        });
      
      // Duplicate registration
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({
          username: "testuser_dup",
          email: "testdup2@test.com",
          password: "TestPassword123!",
          passwordConfirm: "TestPassword123!",
          roles: [testRole._id],
        });
      
      expect(res.status).toBe(400);
    });
  });
  
  describe("POST /api/v1/auth/login", () => {
    beforeAll(async () => {
      // Create test user for login tests
      await request(app)
        .post("/api/v1/auth/register")
        .send({
          username: "testuser_login",
          email: "testlogin@test.com",
          password: "TestPassword123!",
          passwordConfirm: "TestPassword123!",
          roles: [testRole._id],
        });
    });
    
    it("should login with valid credentials", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({
          username: "testuser_login",
          password: "TestPassword123!",
        });
      
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data).toHaveProperty("accessToken");
      expect(res.body.data).toHaveProperty("refreshToken");
    });
    
    it("should reject invalid password", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({
          username: "testuser_login",
          password: "WrongPassword",
        });
      
      expect(res.status).toBe(401);
    });
    
    it("should reject non-existent user", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({
          username: "nonexistent_user",
          password: "TestPassword123!",
        });
      
      expect(res.status).toBe(401);
    });
  });
});

describe("Health Check", () => {
  it("should return healthy status", async () => {
    const res = await request(app).get("/api/v1/health");
    
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body).toHaveProperty("timestamp");
    expect(res.body).toHaveProperty("uptime");
  });
});
