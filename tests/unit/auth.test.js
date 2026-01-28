// Unit Tests for Auth Utilities

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

describe("Password Hashing", () => {
  const testPassword = "TestPassword123!";
  
  it("should hash password correctly", async () => {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(testPassword, salt);
    
    expect(hash).not.toBe(testPassword);
    expect(hash.length).toBeGreaterThan(50);
  });
  
  it("should verify correct password", async () => {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(testPassword, salt);
    
    const isMatch = await bcrypt.compare(testPassword, hash);
    expect(isMatch).toBe(true);
  });
  
  it("should reject incorrect password", async () => {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(testPassword, salt);
    
    const isMatch = await bcrypt.compare("WrongPassword", hash);
    expect(isMatch).toBe(false);
  });
});

describe("JWT Token", () => {
  const testSecret = "test-jwt-secret";
  const testPayload = { userId: "123", username: "testuser" };
  
  it("should generate valid JWT token", () => {
    const token = jwt.sign(testPayload, testSecret, { expiresIn: "1h" });
    
    expect(token).toBeDefined();
    expect(token.split(".")).toHaveLength(3);
  });
  
  it("should decode JWT token correctly", () => {
    const token = jwt.sign(testPayload, testSecret, { expiresIn: "1h" });
    const decoded = jwt.verify(token, testSecret);
    
    expect(decoded.userId).toBe(testPayload.userId);
    expect(decoded.username).toBe(testPayload.username);
  });
  
  it("should reject invalid token", () => {
    const token = jwt.sign(testPayload, testSecret, { expiresIn: "1h" });
    
    expect(() => {
      jwt.verify(token, "wrong-secret");
    }).toThrow();
  });
  
  it("should reject expired token", () => {
    const token = jwt.sign(testPayload, testSecret, { expiresIn: "-1s" });
    
    expect(() => {
      jwt.verify(token, testSecret);
    }).toThrow("jwt expired");
  });
});
