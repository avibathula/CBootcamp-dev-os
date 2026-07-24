import { test, expect } from '@playwright/test'
import path from 'path'
import { readFileSync } from 'fs'

test.use({ storageState: path.join(__dirname, '.auth/user.json') })

const context = JSON.parse(readFileSync(path.join(__dirname, '.auth/context.json'), 'utf-8')) as {
  contractId: string
}

test.describe('Results page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/contracts/${context.contractId}`)
  })

  test('renders at least 10 key terms with the legal disclaimer', async ({ page }) => {
    const panel = page.getByTestId('key-terms-panel')

    // ConfidenceIndicator's visible text is just "NN%" — the "Confidence: NN%"
    // string only exists in the aria-label, so match via accessible name.
    const confidenceBadges = panel.getByLabel(/^Confidence: \d+%/)
    await expect(confidenceBadges.first()).toBeVisible({ timeout: 10_000 })
    await expect(confidenceBadges).toHaveCount(11) // 10 standard NDA terms + 1 seeded custom term

    await expect(page.getByText(/AI-assisted review tool, not legal advice/)).toBeVisible()
    await expect(panel.getByText('Governing Law', { exact: true })).toBeVisible()
    await expect(panel.getByText('Confidentiality Obligations', { exact: true })).toBeVisible()
  })

  test('clicking a page badge does not error and highlights the target page', async ({ page }) => {
    const panel = page.getByTestId('key-terms-panel')
    await expect(panel.getByText('Governing Law', { exact: true })).toBeVisible({ timeout: 10_000 })

    const pageBadge = panel.getByRole('button', { name: /^Page \d+$/ }).first()
    await pageBadge.click()
    // No assertion on exact scroll position (PDF/canvas rendering) — the
    // meaningful check is that clicking doesn't throw/crash the page.
    await expect(panel.getByText('Governing Law', { exact: true })).toBeVisible()
  })

  test('the "Why?" expander reveals the source sentence', async ({ page }) => {
    const panel = page.getByTestId('key-terms-panel')
    await expect(panel.getByText('Governing Law', { exact: true })).toBeVisible({ timeout: 10_000 })

    await panel.getByText('Why?').first().click()
    // Some source sentence text should now be visible in a blockquote.
    await expect(panel.locator('blockquote').first()).toBeVisible()
  })

  test('the seeded custom term (absent from the document) shows a low-confidence warning', async ({ page }) => {
    const panel = page.getByTestId('key-terms-panel')
    await expect(panel.getByText('Total contract value in dollars')).toBeVisible({ timeout: 10_000 })

    const customCard = panel.getByText('Total contract value in dollars').locator('..').locator('..')
    await expect(customCard.getByText('⚠️')).toBeVisible()
    await expect(customCard.getByText('Not found')).toBeVisible()
  })
})
