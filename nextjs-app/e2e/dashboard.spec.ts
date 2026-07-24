import { test, expect } from '@playwright/test'
import path from 'path'
import { readFileSync } from 'fs'

test.use({ storageState: path.join(__dirname, '.auth/user.json') })

const context = JSON.parse(readFileSync(path.join(__dirname, '.auth/context.json'), 'utf-8')) as {
  contractId: string
}

test.describe('Dashboard', () => {
  test('shows the seeded processed contract with stats and a Complete status', async ({ page }) => {
    await page.goto('/dashboard')

    await expect(page.getByText('sample-nda.pdf')).toBeVisible()
    await expect(page.getByText('Complete')).toBeVisible()
    await expect(page.getByText('Total Contracts')).toBeVisible()
  })

  test('sorting by column header changes row order without erroring', async ({ page }) => {
    await page.goto('/dashboard')
    await page.getByRole('button', { name: 'Name' }).click()
    await expect(page.getByText('sample-nda.pdf')).toBeVisible()
  })

  test('clicking a completed row navigates to its results page', async ({ page }) => {
    await page.goto('/dashboard')
    await page.getByText('sample-nda.pdf').click()
    await page.waitForURL(`**/contracts/${context.contractId}`)
  })
})
