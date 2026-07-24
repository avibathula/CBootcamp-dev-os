import { test, expect } from '@playwright/test'
import path from 'path'

test.use({ storageState: path.join(__dirname, '.auth/user.json') })

const FIXTURE_PDF = path.join(__dirname, '../__tests__/fixtures/sample-nda.pdf')

test.describe('Upload', () => {
  test('uploading a non-PDF file shows an error banner', async ({ page }) => {
    await page.goto('/upload')
    await page.getByText('NDA', { exact: true }).click()

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: 'not-a-pdf.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('this is not a pdf'),
    })

    await expect(page.getByText('Only PDF files are accepted.')).toBeVisible()
  })

  test('uploading an oversized PDF shows an error banner', async ({ page }) => {
    await page.goto('/upload')
    await page.getByText('NDA', { exact: true }).click()

    const oversized = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(11 * 1024 * 1024)])
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({ name: 'big.pdf', mimeType: 'application/pdf', buffer: oversized })

    await expect(page.getByText('File exceeds the 10 MB limit.')).toBeVisible()
  })

  test('a valid NDA upload flows through extraction to the results page', async ({ page }) => {
    await page.goto('/upload')
    await page.getByText('NDA', { exact: true }).click()

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(FIXTURE_PDF)

    // Pre-processing preview should appear with the standard NDA terms.
    await expect(page.getByText('Key terms ContractIQ will extract')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Confidentiality Obligations')).toBeVisible()

    await page.getByRole('button', { name: 'Process Contract' }).click()

    // Real GPT-4o extraction — allow generous time — then redirect to results.
    await page.waitForURL(/\/contracts\/[a-f0-9-]+$/, { timeout: 45_000 })
    await expect(page.getByText('Governing Law')).toBeVisible({ timeout: 15_000 })
  })
})
