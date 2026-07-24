import { test, expect } from '@playwright/test'
import path from 'path'
import { readFileSync } from 'fs'

test.use({ storageState: path.join(__dirname, '.auth/user.json') })

const context = JSON.parse(readFileSync(path.join(__dirname, '.auth/context.json'), 'utf-8')) as {
  contractId: string
}

test.describe('Contract chat', () => {
  test('a grounded question gets a cited response, with a clickable citation, and persists across reload', async ({
    page,
  }) => {
    await page.goto(`/contracts/${context.contractId}`)
    await expect(page.getByTestId('key-terms-panel').getByText('Governing Law', { exact: true })).toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: 'Open chat' }).click()
    const chatInput = page.getByLabel('Chat message')
    await chatInput.fill('What is the term duration of this agreement?')
    await page.getByRole('button', { name: 'Send message' }).click()

    const citation = page.getByRole('button', { name: /\[Page \d+\]/ }).first()
    await expect(citation).toBeVisible({ timeout: 20_000 })
    await citation.click() // should not throw

    await page.reload()
    await page.getByRole('button', { name: 'Open chat' }).click()
    await expect(page.getByText('What is the term duration of this agreement?')).toBeVisible({ timeout: 10_000 })
  })
})
