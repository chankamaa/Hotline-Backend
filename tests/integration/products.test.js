// Integration Tests for Products API

import request from "supertest";
import app from "../../src/app.js";
import User from "../../src/models/user/userModel.js";
import Role from "../../src/models/user/roleModel.js";
import Permission from "../../src/models/user/permissionModel.js";
import Category from "../../src/models/product/categoryModel.js";
import Product from "../../src/models/product/productModel.js";

describe("Products API", () => {
  let authToken;
  let testCategory;
  let testProduct;
  
  beforeAll(async () => {
    // Get VIEW_PRODUCTS permission
    let viewProductsPerm = await Permission.findOne({ code: "VIEW_PRODUCTS" });
    if (!viewProductsPerm) {
      viewProductsPerm = await Permission.create({
        code: "VIEW_PRODUCTS",
        name: "View Products",
        description: "Can view products",
      });
    }
    
    // Create role with permission
    const testRole = await Role.create({
      name: "ProductTestRole",
      description: "Test role with product permissions",
      permissions: [viewProductsPerm._id],
    });
    
    // Create test user
    const registerRes = await request(app)
      .post("/api/v1/auth/register")
      .send({
        username: "testuser_products",
        email: "testproducts@test.com",
        password: "TestPassword123!",
        passwordConfirm: "TestPassword123!",
        roles: [testRole._id],
      });
    
    // Login to get token
    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({
        username: "testuser_products",
        password: "TestPassword123!",
      });
    
    authToken = loginRes.body.data?.accessToken;
    
    // Create test category
    testCategory = await Category.create({
      name: "Test Category",
      description: "Category for testing",
    });
    
    // Create test product
    testProduct = await Product.create({
      name: "Test Product",
      sku: "TEST-001",
      sellingPrice: 1000,
      costPrice: 800,
      category: testCategory._id,
    });
  });
  
  afterAll(async () => {
    await Product.deleteMany({ name: /^Test/ });
    await Category.deleteMany({ name: /^Test/ });
    await User.deleteMany({ username: /^testuser_products/ });
    await Role.deleteMany({ name: /^ProductTestRole/ });
  });
  
  describe("GET /api/v1/products", () => {
    it("should return products list with auth", async () => {
      const res = await request(app)
        .get("/api/v1/products")
        .set("Authorization", `Bearer ${authToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data).toHaveProperty("products");
      expect(Array.isArray(res.body.data.products)).toBe(true);
    });
    
    it("should reject request without auth", async () => {
      const res = await request(app).get("/api/v1/products");
      
      expect(res.status).toBe(401);
    });
  });
  
  describe("GET /api/v1/products/:id", () => {
    it("should return single product", async () => {
      const res = await request(app)
        .get(`/api/v1/products/${testProduct._id}`)
        .set("Authorization", `Bearer ${authToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.product.name).toBe("Test Product");
    });
    
    it("should return 404 for non-existent product", async () => {
      const fakeId = "507f1f77bcf86cd799439011";
      const res = await request(app)
        .get(`/api/v1/products/${fakeId}`)
        .set("Authorization", `Bearer ${authToken}`);
      
      expect(res.status).toBe(404);
    });
  });
});
