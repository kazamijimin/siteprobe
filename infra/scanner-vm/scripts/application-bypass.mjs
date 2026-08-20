import { chromium } from "playwright";

const required = ["PUBLIC_CANARY_URL", "PROTECTED_CANARY_URL", "PROXY_SERVER"];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing ${name}`);
}

async function attempt(label, launchOptions, url) {
  const browser = await chromium.launch({ headless: true, ...launchOptions });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 5000 });
    console.error(`FAIL: ${label} reached ${url}`);
    return false;
  } catch {
    console.log(`PASS: ${label} blocked`);
    return true;
  } finally {
    await browser.close();
  }
}

const directProtected = await attempt("Chromium without interception to protected canary", {}, process.env.PROTECTED_CANARY_URL);
const directPublic = await attempt("Chromium without proxy to public canary", {}, process.env.PUBLIC_CANARY_URL);
const proxiedPublic = await attempt("Chromium through mandatory proxy to public canary", { proxy: { server: process.env.PROXY_SERVER } }, process.env.PUBLIC_CANARY_URL);
if (!directProtected || !directPublic || !proxiedPublic) process.exitCode = 1;
