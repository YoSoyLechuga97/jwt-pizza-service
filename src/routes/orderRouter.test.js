const request = require("supertest");
const app = require("../service");

const { Role, DB } = require("../database/database.js");
const testUser = { name: "pizza diner", email: "reg@test.com", password: "a" };
let testUserAuthToken;
let adminToken;
let adminUser;
let menuLength = 0;
let thePizza;

beforeAll(async () => {
  testUser.email = Math.random().toString(36).substring(2, 12) + "@test.com";
  const registerRes = await request(app).post("/api/auth").send(testUser);
  testUserAuthToken = registerRes.body.token;
  expectValidJwt(testUserAuthToken);

  //Create an admin user
  await login();

  //Create a menu
  thePizza = await generateMenu();

  //Find Menu Length
  let menu = await DB.getMenu();
  menuLength = menu.length;
});

async function generateMenu() {
  for (let I = 0; I < 5; I++) {
    let newPizza = generatePizza();
    DB.addMenuItem(newPizza);
    thePizza = newPizza;
  }
  return thePizza;
}

async function franchiseAndStore() {
  //Create a franchise
  let newFranchise = await DB.createFranchise({
    name: randomName() + " Franchise",
    admins: [{ email: adminUser.email }],
  });

  //Create a store
  let newStore = await DB.createStore(newFranchise.id, {
    name: randomName() + " Store",
    address: randomName() + " Address",
  });

  return { franchise: newFranchise, store: newStore };
}

async function createAdminUser() {
  let user = { password: "toomanysecrets", roles: [{ role: Role.Admin }] };
  user.name = randomName();
  user.email = user.name + "@admin.com";
  DB.user = await DB.addUser(user);
  return { ...user, password: "toomanysecrets" };
}

async function login() {
  adminUser = await createAdminUser();
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
  let newPizza = generatePizza();
  const res = await request(app)
    .put("/api/order/menu")
    .set("Authorization", "Bearer " + adminToken)
    .send(newPizza);

  thePizza = newPizza;
  expect(res.status).toBe(200);
});

test("getOrders", async () => {
  const res = await request(app)
    .get("/api/order")
    .set("Authorization", "Bearer " + testUserAuthToken);

  expect(res.status).toBe(200);
});

test("createOrder", async () => {
  let { franchise, store } = await franchiseAndStore();
  console.log("franchiseID: ", franchise.id);
    console.log("storeID: ", store.id);
  const res = await request(app)
    .post("/api/order")
    .set("Authorization", "Bearer " + testUserAuthToken)
    .send({
      franchiseId: franchise.id,
      storeId: store.id,
      items: [
        {
          menuId: menuLength - 1,
          description: thePizza.description,
          price: thePizza.price,
        },
      ],
    });

  console.log("The body is: ", res.body);

  expect(res.body.jwt).toBeDefined();
  expect(res.status).toBe(200);
});
