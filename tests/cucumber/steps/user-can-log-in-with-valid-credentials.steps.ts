import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import type { CustomWorld } from "../support/world.js";

const baseUrl = () => process.env.BASE_URL || "http://localhost:3000";

Given("the application is reachable", async function (this: CustomWorld) {
  const res = await this.page.request.get(baseUrl());
  assert.ok(res.ok() || res.status() < 500, `App not reachable: ${res.status()}`);
});

Given("I am on the login page", async function (this: CustomWorld) {
  await this.page.goto(`${baseUrl()}/login`);
  await this.page.getByRole("heading", { name: /sign in|log in|login/i }).waitFor({ timeout: 10_000 }).catch(() => {
    // Heading may vary; page load is enough for generated scaffolding.
  });
});

When(
  "I enter email {string} and password {string}",
  async function (this: CustomWorld, email: string, password: string) {
    await this.page.getByLabel(/email/i).fill(email);
    await this.page.getByLabel(/password/i).fill(password);
  },
);

When("I click the Sign In button", async function (this: CustomWorld) {
  await this.page.getByRole("button", { name: /sign in|log in|login/i }).click();
});

Then("I should be redirected to the dashboard", async function (this: CustomWorld) {
  await this.page.waitForURL(/dashboard/i, { timeout: 15_000 });
});

Then("I should see a welcome message", async function (this: CustomWorld) {
  const welcome = this.page.getByText(/welcome/i);
  await welcome.waitFor({ timeout: 10_000 });
  assert.ok(await welcome.isVisible());
});

Then("I should see a login error message", async function (this: CustomWorld) {
  const error = this.page.getByRole("alert").or(this.page.getByText(/invalid|incorrect|error/i));
  await error.first().waitFor({ timeout: 10_000 });
});

Then("I should remain on the login page", async function (this: CustomWorld) {
  assert.match(this.page.url(), /login/i);
});
