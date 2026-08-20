import { chromium, type Browser } from "playwright";

export interface BrowserLauncher {
  launch(): Promise<Browser>;
}

export const chromiumLauncher: BrowserLauncher = {
  launch: () => chromium.launch({ headless: true }),
};
