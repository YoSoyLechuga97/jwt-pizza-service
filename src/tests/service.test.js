const request = require("supertest");
const app = require("../service.js");

test("GET /pizzas", async () => {
  const response = await request(app).get("/pizzas");
  expect(response.statusCode).toBe(200);
  expect(response.body).toEqual([]);
});
