import { chromium, type Browser } from "playwright";

export interface BrowserLauncher {
  launch(options?: { proxyServer?: string }): Promise<Browser>;
}

export const chromiumLauncher: BrowserLauncher = {
  launch: (options) => chromium.launch({
    headless: true,
    ...(options?.proxyServer ? { proxy: { server: options.proxyServer } } : {}),
  }),
};
