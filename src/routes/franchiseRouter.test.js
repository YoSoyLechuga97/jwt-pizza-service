const request = require("supertest");
const app = require("../service");

const { Role, DB } = require("../database/database.js");
let adminUser = createAdminUser();
let adminToken;
let franchiseId;
let storeID;
let numFranchises = 0;
function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

async function createAdminUser() {
  let user = { password: "toomanysecrets", roles: [{ role: Role.Admin }] };
  user.name = randomName();
  user.email = user.name + "@admin.com";

  user = await DB.addUser(user);
  adminId = user.id;
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
  adminId = loginRes.body.user.id;
}

beforeAll(async () => {
  await login();
});

async function getFranchises() {
  const res = await request(app)
    .get("/api/franchise")
    .set("Authorization", "Bearer " + adminToken);
  return res.body.length;
}

test("Get franchises", async () => {
  const res = await request(app)
    .get("/api/franchise")
    .set("Authorization", "Bearer " + adminToken);

  numFranchises = res.body.length;
  console.log(numFranchises);

  expect(res.status).toBe(200);
});

test("Get user franchises", async () => {
  const res = await request(app)
    .get("/api/franchise/" + "4") //This is a franchise owner I know exists
    .set("Authorization", "Bearer " + adminToken);

  expect(res.status).toBe(200);
});

test("Create franchise", async () => {
  franchiseName = randomName() + " Franchise";

  const newFranchise = {
    name: franchiseName,
    admins: [{ email: "t@jwt.com" }],
  };

  const res = await request(app)
    .post("/api/franchise")
    .set("Authorization", "Bearer " + adminToken)
    .send(newFranchise);

  currFranchises = await getFranchises();
  expect(currFranchises).toBeGreaterThan(numFranchises);

  franchiseId = res.body.id;
  expect(res.status).toBe(200);
});

test("Delete franchise", async () => {
  const res = await request(app)
    .delete("/api/franchise/" + franchiseId)
    .set("Authorization", "Bearer " + adminToken);

  currFranchises = await getFranchises();
  expect(currFranchises).toBe(numFranchises);

  expect(res.status).toBe(200);
});

test("Create store", async () => {
  const storeName = randomName() + " Store";
  const newStore = {
    franchiseId: 4, //This is the ID for my test franchise
    name: storeName,
  };

  const res = await request(app)
    .post("/api/franchise/4/store")
    .set("Authorization", "Bearer " + adminToken)
    .send(newStore);

  storeID = res.body.id;

  expect(res.status).toBe(200);
  expect(res.body.name).toBe(storeName);
});

test("Delete store", async () => {
  const res = await request(app)
    .delete("/api/franchise/4/store/" + storeID)
    .set("Authorization", "Bearer " + adminToken);

  expect(res.status).toBe(200);
});
