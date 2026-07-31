import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { CustomWorld } from '../support/world.js';

Given('I am viewing a product page', async function (this: CustomWorld) {
  const page = this.page;
  await page.goto(process.env.BASE_URL || 'http://localhost:3000/product');
});

When('I click "Add to Cart"', async function (this: CustomWorld) {
  const page = this.page;
  await page.getByRole('button', { name: 'Add to Cart' }).click();
});

Then('the product appears in my cart', async function (this: CustomWorld) {
  const page = this.page;
  await page.goto(process.env.BASE_URL || 'http://localhost:3000/cart');
  const productInCart = await page.getByText('Product Name').isVisible();
  assert(productInCart, 'Product should be visible in the cart');
});

Then('the cart count increases by 1', async function (this: CustomWorld) {
  const page = this.page;
  const cartCount = await page.getByRole('status', { name: 'Cart count' }).innerText();
  assert.strictEqual(Number(cartCount), 1, 'Cart count should be 1');
});
