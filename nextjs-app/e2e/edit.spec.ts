import { test, expect } from '@playwright/test'
import path from 'path'
import { readFileSync } from 'fs'

test.use({ storageState: path.join(__dirname, '.auth/user.json') })

const context = JSON.parse(readFileSync(path.join(__dirname, '.auth/context.json'), 'utf-8')) as {
  contractId: string
}

test.describe('Inline term editing', () => {
  test('editing a term value shows the Edited badge and persists across reload', async ({ page }) => {
    await page.goto(`/contracts/${context.contractId}`)
    const panel = page.getByTestId('key-terms-panel')
    await expect(panel.getByText('Governing Law', { exact: true })).toBeVisible({ timeout: 10_000 })

    const governingLawCard = panel.getByText('Governing Law', { exact: true }).locator('..').locator('..')
    await governingLawCard.getByText('State of Delaware').click()

    const input = governingLawCard.locator('input')
    await input.fill('State of California (edited by e2e test)')
    await input.blur()

    await expect(governingLawCard.getByText('Edited', { exact: true })).toBeVisible({ timeout: 5_000 })
    await expect(governingLawCard.getByText('State of California (edited by e2e test)')).toBeVisible()

    await page.reload()
    const reloadedPanel = page.getByTestId('key-terms-panel')
    const reloadedCard = reloadedPanel.getByText('Governing Law', { exact: true }).locator('..').locator('..')
    await expect(reloadedCard.getByText('State of California (edited by e2e test)')).toBeVisible({
      timeout: 10_000,
    })
    await expect(reloadedCard.getByText('Edited', { exact: true })).toBeVisible()
  })
})
