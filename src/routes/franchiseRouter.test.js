const request = require("supertest");
const app = require("../service");

const { Role, DB } = require("../database/database.js");
const testUser = { name: "pizza diner", email: "reg@test.com", password: "a" };
let testUserAuthToken;
let adminUser = createAdminUser();
let adminToken;
let adminUserID;
let franchiseId;
let theFranchise;
let storeID;
let numFranchises;
function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

async function createAdminUser() {
  let user = { password: "toomanysecrets", roles: [{ role: Role.Admin }] };
  user.name = randomName();
  user.email = user.name + "@admin.com";

  user = await DB.addUser(user);
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
  adminUserID = loginRes.body.user.id;
}

beforeAll(async () => {
  testUser.email = Math.random().toString(36).substring(2, 12) + "@test.com";
  const registerRes = await request(app).post("/api/auth").send(testUser);
  testUserAuthToken = registerRes.body.token;
  expectValidJwt(testUserAuthToken);

  //Create an admin user
  await login();

  //Create a franchise
  theFranchise = await DB.createFranchise({
    name: randomName() + " Franchise",
    admins: [{ email: adminUser.email }],
  });

  franchiseId = theFranchise.id;

  //Get franchise count
  let allFranchises = await DB.getFranchises();
  numFranchises = allFranchises.length;
  //Create stores
});

function expectValidJwt(potentialJwt) {
  expect(potentialJwt).toMatch(
    /^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/
  );
}

test("Get franchises", async () => {
  const res = await request(app)
    .get("/api/franchise")
    .set("Authorization", "Bearer " + adminToken);

  expect(res.body.length).toBe(numFranchises);
  expect(res.status).toBe(200);
});

test("Get user franchises", async () => {
  const res = await request(app)
    .get("/api/franchise/" + adminUserID)
    .set("Authorization", "Bearer " + adminToken);

  expect(res.status).toBe(200);
  expect(res.body.length).toBeGreaterThan(0);
});

test("Create franchise", async () => {
  let preFranchises = await DB.getFranchises();
  console.log("preFranchises: " + preFranchises.length);
  let franchiseName = randomName() + " Franchise";

  const newFranchise = {
    name: franchiseName,
    admins: [{ email: adminUser.email }],
  };

  const res = await request(app)
    .post("/api/franchise")
    .set("Authorization", "Bearer " + adminToken)
    .send(newFranchise);

  let currFranchises = await DB.getFranchises();

  expect(res.status).toBe(200);
  expect(currFranchises.length).toBe(numFranchises + 1);
});

test("Delete franchise", async () => {
  let preFranchises = await DB.getFranchises();
  let franchisesBeforeDelete = preFranchises.length;

  console.log("preFranchises: " + preFranchises.length);
  console.log("franchiseId: " + franchiseId);
  const res = await request(app)
    .delete("/api/franchise/" + franchiseId)
    .set("Authorization", "Bearer " + adminToken);

  let currFranchises = await DB.getFranchises();
  expect(currFranchises.length).toBe(franchisesBeforeDelete - 1);

  expect(res.status).toBe(200);
});

test("Create store", async () => {
  const storeName = randomName() + " Store";
  const newStore = {
    franchiseId: franchiseId,
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
