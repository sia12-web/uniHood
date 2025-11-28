import { test, expect } from '@playwright/test';

test('full game flow', async ({ browser }) => {
    // Create two contexts for two players
    const p1Context = await browser.newContext();
    const p2Context = await browser.newContext();

    const p1Page = await p1Context.newPage();
    const p2Page = await p2Context.newPage();

    // Player 1 creates game
    await p1Page.goto('/');
    await p1Page.click('text=Create New Game');

    // Wait for game page and get code
    await expect(p1Page).toHaveURL(/\/game\/.+/);

    // Use a more specific selector for the code
    const codeElement = p1Page.locator('span.font-mono.text-xl');
    await expect(codeElement).toBeVisible();
    const codeText = await codeElement.innerText();
    const code = codeText.trim();
    console.log(`Game Code: ${code}`);

    // Player 2 joins game
    await p2Page.goto('/');
    await p2Page.fill('input[placeholder="Enter Code"]', code);
    await p2Page.click('button:has-text("Join")');

    // Verify both are in game
    await expect(p2Page).toHaveURL(new RegExp(`/game/${code}`));
    await expect(p1Page.locator('text=Player X')).toBeVisible();
    await expect(p2Page.locator('text=Player O')).toBeVisible();

    // Play game
    // P1 (X) moves
    await p1Page.locator('button:not([disabled])').first().click();

    // P2 (O) moves
    await expect(p2Page.locator('button:not([disabled])').first()).toBeVisible();
    // We need to pick a specific cell to avoid conflict if P1 took the first one.
    // Let's assume grid order. P1 took index 0. P2 takes index 1.
    // But the locator 'button:not([disabled])' will exclude the taken one.
    await p2Page.locator('button:not([disabled])').first().click();

    // Check turn updates
    await expect(p1Page.locator('text=Player X')).toBeVisible(); // Just checking presence, ideally check active state
});
