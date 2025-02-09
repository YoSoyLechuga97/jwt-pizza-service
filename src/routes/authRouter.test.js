const request = require("supertest");
const app = require("../service");

const testUser = { name: "pizza diner", email: "reg@test.com", password: "a" };
let testUserAuthToken;
let testUserID;

beforeAll(async () => {
  testUser.email = Math.random().toString(36).substring(2, 12) + "@test.com";
  const registerRes = await request(app).post("/api/auth").send(testUser);
  testUserAuthToken = registerRes.body.token;
  expectValidJwt(testUserAuthToken);
});

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

test("login", login);

async function login() {
  const loginRes = await request(app).put("/api/auth").send(testUser);
  expect(loginRes.status).toBe(200);
  expectValidJwt(loginRes.body.token);

  const expectedUser = { ...testUser, roles: [{ role: "diner" }] };
  delete expectedUser.password;
  expect(loginRes.body.user).toMatchObject(expectedUser);

  testUserAuthToken = loginRes.body.token;
  testUserID = loginRes.body.user.id;
}

function expectValidJwt(potentialJwt) {
  expect(potentialJwt).toMatch(
    /^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/
  );
}

test("update user email", async () => {
  const newEmail = randomName() + "@test.com";
  const updatedUser = await request(app)
    .put("/api/auth/" + testUserID)
    .set("Authorization", "Bearer " + testUserAuthToken)
    .send({ email: newEmail, password: testUser.password });
  expect(updatedUser.status).toBe(200);
  testUser.email = newEmail;
});

test("update user password", async () => {
    const newPassword = "newpassword";
    const updatedUser = await request(app)
        .put("/api/auth/" + testUserID)
        .set("Authorization", "Bearer " + testUserAuthToken)
        .send({ email: testUser.email, password: newPassword });
    expect(updatedUser.status).toBe(200);
    testUser.password = newPassword;
    });

test("logout", async () => {
  //User is already logged in from previous test
  const logoutRes = await request(app)
    .delete("/api/auth")
    .set("Authorization", "Bearer " + testUserAuthToken);
  expect(logoutRes.status).toBe(200);
});

test("fail to logout", async () => {
  //No token provided
  const logoutRes = await request(app).delete("/api/auth");
  expect(logoutRes.status).toBe(401);
  //Invalid token provided
  const logoutRes2 = await request(app)
    .delete("/api/auth")
    .set("Authorization", "Bearer " + testUserAuthToken + "invalid");
  expect(logoutRes2.status).toBe(401);
});
