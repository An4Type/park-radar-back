import { chromium, type Browser, type Page } from 'playwright';

// A worker shares one long-lived Chromium process across its parking monitors.
export class BrowserManager {
  private browser: Browser | null = null;

  async newPage(): Promise<Page> {
    if (!this.browser?.isConnected()) this.browser = await chromium.launch({ headless: true });
    return this.browser.newPage();
  }

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
  }
}
