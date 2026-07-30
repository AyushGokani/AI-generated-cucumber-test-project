import {
  setWorldConstructor,
  Before,
  After,
  AfterAll,
  setDefaultTimeout,
  type ITestCaseHookParameter,
} from "@cucumber/cucumber";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

setDefaultTimeout(60_000);

export class CustomWorld {
  browser?: Browser;
  context?: BrowserContext;
  page!: Page;
}

setWorldConstructor(CustomWorld);

let sharedBrowser: Browser | undefined;

function needsBrowser(pickle: ITestCaseHookParameter["pickle"]): boolean {
  const tags = new Set((pickle.tags ?? []).map((t) => t.name));
  // Framework/smoke health checks do not drive a real UI.
  if (tags.has("@framework") && !tags.has("@e2e") && !tags.has("@generated")) {
    return false;
  }
  return true;
}

Before(async function (this: CustomWorld, { pickle }) {
  if (!needsBrowser(pickle)) return;

  if (!sharedBrowser) {
    sharedBrowser = await chromium.launch({
      headless: process.env.HEADED !== "1",
    });
  }
  this.browser = sharedBrowser;
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
  sharedBrowser = undefined;
});
