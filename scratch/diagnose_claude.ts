import { ClaudeDriver } from '../src/drivers/ClaudeDriver.js';
import { logger } from '../src/utils/logger.js';

async function main() {
  const driver = new ClaudeDriver();
  try {
    // Initialize in headed (visible) mode for this test
    await driver.init(false);
    console.log('Driver initialized.');
    
    // Wait a bit to ensure redirects are completed
    await new Promise(resolve => setTimeout(resolve, 8000));
    
    const url = (driver as any).page.url();
    console.log('Current URL:', url);
    
    const title = await (driver as any).page.title();
    console.log('Page Title:', title);
    
    // Check if there is any visible text
    const text = await (driver as any).page.innerText('body').catch(() => '');
    console.log('Body text sample (first 500 chars):', text.substring(0, 500));
    
    const checks = await driver.verifyUI();
    console.log('UI Verification results:', checks);
    
  } catch (err) {
    console.error('Error during diagnosis:', err);
  } finally {
    await driver.close();
  }
}

main();
