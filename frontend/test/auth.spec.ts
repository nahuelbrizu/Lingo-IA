import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('should redirect to Google sign-in when clicking the start button', async ({ page }) => {
    // Start the server before the test
    await page.goto('http://localhost:3000/');

    // Find and click the "Comenzar a Aprender" button
    await page.getByRole('button', { name: 'Comenzar a Aprender' }).click();

    // Wait for the navigation to a Google accounts page
    await page.waitForURL('**/accounts.google.com/**');

    // Assert that the new URL is a Google Accounts URL
    expect(page.url()).toContain('accounts.google.com');
  });
});
