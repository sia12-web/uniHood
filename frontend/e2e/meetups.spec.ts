import { test, expect } from "@playwright/test";

test.describe("Meetups E2E", () => {
    test("should create a meetup, join, and chat", async ({ page }) => {
        // 1. Login
        await page.goto("/login");
        await page.getByLabel("Email").fill("sammyb@mcgill.ca");
        await page.getByLabel("Password").fill("password123");
        await page.getByRole("button", { name: "Sign In" }).click();

        // Wait for dashboard
        await expect(page).toHaveURL("/");

        // 2. Navigate to Meetups
        await page.goto("/meetups");
        await expect(page.getByRole("heading", { name: "Meetups" })).toBeVisible();

        // 3. Create a new Meetup
        await page.getByRole("button", { name: "Create Meetup" }).click();

        const title = `Gym Session ${Date.now()}`;
        await page.locator('input[name="title"]').waitFor({ state: "visible" });
        await page.locator('input[name="title"]').fill(title);
        await page.locator('textarea[name="description"]').fill("Let's hit the gym!");

        // Select Category
        await page.locator('select[name="category"]').selectOption("gym");

        // Select Visibility (Global)
        await page.locator('input[name="visibility"][value="GLOBAL"]').check();

        // Select Date (wait for options)
        const dateSelect = page.locator('select[name="date"]');
        await expect(dateSelect).toBeVisible();
        // Wait for options to be populated
        await page.waitForTimeout(500);
        await dateSelect.selectOption({ index: 1 }); // Select tomorrow to be safe

        // Set Time
        await page.locator('input[name="time"]').fill("12:00");

        await page.getByRole("button", { name: "Create Meetup" }).click();

        // 4. Verify Redirection to Detail Page
        // Increase timeout for redirection
        await expect(page).toHaveURL(/\/meetups\/.+/, { timeout: 10000 });
        await expect(page.getByRole("heading", { name: title })).toBeVisible();

        // 5. Verify Participant (Me)
        await expect(page.getByText("Participants")).toBeVisible();

        // 6. Chat
        const message = `Hello from E2E ${Date.now()}`;
        await page.getByPlaceholder("Type a message...").fill(message);
        await page.getByRole("button", { name: "Send" }).click();

        // 7. Verify Message
        await expect(page.getByText(message)).toBeVisible();

        // Verify bubble style (Me style has bg-blue-600)
        const bubble = page.getByText(message);
        await expect(bubble).toHaveClass(/bg-blue-600/);
    });
});
