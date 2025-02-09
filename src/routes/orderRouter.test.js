const request = require("supertest");
const app = require("../service");

const { Role, DB } = require("../database/database.js");
const testUser = { name: "pizza diner", email: "reg@test.com", password: "a" };
let testUserAuthToken;
let adminToken;
let menuLength;

beforeAll(async () => {
  testUser.email = Math.random().toString(36).substring(2, 12) + "@test.com";
  const registerRes = await request(app).post("/api/auth").send(testUser);
  testUserAuthToken = registerRes.body.token;
  expectValidJwt(testUserAuthToken);
});

async function createAdminUser() {
  let user = { password: "toomanysecrets", roles: [{ role: Role.Admin }] };
  user.name = randomName();
  user.email = user.name + "@admin.com";

  user = await DB.addUser(user);
  return { ...user, password: "toomanysecrets" };
}

async function login() {
  let adminUser = await createAdminUser();
  const loginRes = await request(app).put("/api/auth").send(adminUser);
  expect(loginRes.status).toBe(200);

  const expectedUser = { ...adminUser, roles: [{ role: "admin" }] };
  delete expectedUser.password;
  expect(loginRes.body.user).toMatchObject(expectedUser);

  adminToken = loginRes.body.token;
}

function generatePizza() {
  return {
    id: menuLength + 1,
    title: randomName() + " Pizza",
    description: "A delicious pizza",
    image: "randomImage.png",
    price: 0.0002,
  };
}

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

function expectValidJwt(potentialJwt) {
  expect(potentialJwt).toMatch(
    /^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/
  );
}

test("Get Menu", async () => {
  const res = await request(app)
    .get("/api/order/menu")
    .set("Authorization", "Bearer " + testUserAuthToken);

  menuLength = res.length;

  expect(res.status).toBe(200);
});

test("Add Menu Item - unauthorized", async () => {
  let newPizza = generatePizza();
  const res = await request(app)
    .put("/api/order/menu")
    .set("Authorization", "Bearer " + testUserAuthToken)
    .send(newPizza);

  expect(res.status).toBe(403);
  expect(res.length == menuLength);
});

test("Add Menu Item - authorized", async () => {
  await login();
  let newPizza = generatePizza();
  const res = await request(app)
    .put("/api/order/menu")
    .set("Authorization", "Bearer " + adminToken)
    .send(newPizza);

  expect(res.status).toBe(200);
  expect(res.length == menuLength + 1);
});

test("getOrders", async () => {
  const res = await request(app)
    .get("/api/order")
    .set("Authorization", "Bearer " + testUserAuthToken);

  expect(res.status).toBe(200);
});

test("createOrder", async () => {
  const res = await request(app)
    .post("/api/order")
    .set("Authorization", "Bearer " + testUserAuthToken)
    .send({
      franchiseId: 1,
      storeId: 1,
      items: [{ menuId: 1, description: "Veggie", price: 0.05 }],
    });

  expect(res.status).toBe(200);
});
