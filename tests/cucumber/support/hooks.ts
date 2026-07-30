import { Given } from "@cucumber/cucumber";
import type { CustomWorld } from "./world.js";

/**
 * Shared steps available to all generated features.
 * Generated step files can override / extend these.
 */
Given("I open {string}", async function (this: CustomWorld, path: string) {
  const base = process.env.BASE_URL || "http://localhost:3000";
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? path : `/${path}`}`;
  await this.page.goto(url);
});
