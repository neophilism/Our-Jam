// CI-only evidence: render the exact public stage after the real native UI submitted a tag.
import { chromium, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:4173/screen/native-integration');
  await expect(page.getByText('Native warm brass', { exact: true }).first()).toBeVisible({ timeout: 20000 });
  await page.screenshot({ path: 'ios-evidence/native-to-stage.png', fullPage: true });
  await writeFile('ios-evidence/native-to-stage.json', JSON.stringify({ verified: true, tag: 'Native warm brass', route: '/screen/native-integration', source: 'native XCUITest submission into isolated real API/database', simulatedProductionData: false }, null, 2));
} finally { await browser.close(); }
