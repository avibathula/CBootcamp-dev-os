import { test, expect } from '@playwright/test'
import path from 'path'
import { readFileSync } from 'fs'

test.use({ storageState: path.join(__dirname, '.auth/user.json') })

const context = JSON.parse(readFileSync(path.join(__dirname, '.auth/context.json'), 'utf-8')) as {
  contractId: string
}

test.describe('Feedback', () => {
  test('submitting thumbs up shows a confirmation, and resubmitting with a comment updates it', async ({
    page,
  }) => {
    await page.goto(`/contracts/${context.contractId}`)
    await expect(page.getByTestId('key-terms-panel').getByText('Governing Law')).toBeVisible({ timeout: 10_000 })

    await page.getByLabel('Thumbs up').click()
    await page.getByPlaceholder('Optional: tell us more…').fill('Missed the auto-renewal clause on page 5')
    await page.getByRole('button', { name: 'Submit' }).click()

    await expect(page.getByText('Thanks for your feedback')).toBeVisible({ timeout: 10_000 })

    // Resubmit as thumbs down — upsert, not a duplicate.
    await page.getByLabel('Thumbs down').click()
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(page.getByText('Thanks for your feedback')).toBeVisible({ timeout: 10_000 })

    // Reload should show the most recent rating pre-selected.
    await page.reload()
    await expect(page.getByLabel('Thumbs down')).toHaveAttribute('aria-pressed', 'true')
  })
})
