import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { CustomWorld } from '../support/world.js';

Given('I am on the login page', async function (this: CustomWorld) {
  await this.page.goto(process.env.BASE_URL || 'http://localhost:3000');
});

When('I enter valid email and password', async function (this: CustomWorld) {
  await this.page.fill('input[type="email"]', 'valid@example.com');
  await this.page.fill('input[type="password"]', 'validPassword');
  await this.page.click('button[type="submit"]');
});

When('I enter invalid email and password', async function (this: CustomWorld) {
  await this.page.fill('input[type="email"]', 'invalid@example.com');
  await this.page.fill('input[type="password"]', 'invalidPassword');
  await this.page.click('button[type="submit"]');
});

Then('I am redirected to the dashboard', async function (this: CustomWorld) {
  await this.page.waitForNavigation();
  const url = this.page.url();
  assert(url.includes('/dashboard'), 'User is not redirected to the dashboard');
});

Then('I see an error message', async function (this: CustomWorld) {
  const errorMessage = await this.page.textContent('.error-message');
  assert(errorMessage !== null, 'Error message is not displayed');
});

Then('I remain on the login page', async function (this: CustomWorld) {
  const url = this.page.url();
  assert(url.includes('/login'), 'User is not on the login page');
});