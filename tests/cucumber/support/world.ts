import {
  setWorldConstructor,
  Before,
  After,
  BeforeAll,
  AfterAll,
  setDefaultTimeout,
} from "@cucumber/cucumber";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

setDefaultTimeout(60_000);

export class CustomWorld {
  browser!: Browser;
  context!: BrowserContext;
  page!: Page;
}

setWorldConstructor(CustomWorld);

let sharedBrowser: Browser | undefined;

BeforeAll(async () => {
  sharedBrowser = await chromium.launch({
    headless: process.env.HEADED !== "1",
  });
});

Before(async function (this: CustomWorld) {
  this.browser = sharedBrowser!;
  this.context = await this.browser.newContext({
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    viewport: { width: 1280, height: 720 },
  });
  this.page = await this.context.newPage();
});

After(async function (this: CustomWorld) {
  await this.page?.close().catch(() => undefined);
  await this.context?.close().catch(() => undefined);
});

AfterAll(async () => {
  await sharedBrowser?.close();
});
