import { Given } from "@cucumber/cucumber";
import assert from "node:assert/strict";

Given("the cucumber framework is ready", async function () {
  assert.equal(1 + 1, 2);
});
