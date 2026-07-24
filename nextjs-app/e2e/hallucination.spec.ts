import { test, expect } from '@playwright/test'
import path from 'path'
import { readFileSync } from 'fs'

test.use({ storageState: path.join(__dirname, '.auth/user.json') })

const context = JSON.parse(readFileSync(path.join(__dirname, '.auth/context.json'), 'utf-8')) as {
  contractId: string
}

test.describe('Chat hallucination guardrail', () => {
  test('a question about content absent from the document is refused, not fabricated', async ({ page }) => {
    await page.goto(`/contracts/${context.contractId}`)
    await expect(page.getByTestId('key-terms-panel').getByText('Governing Law', { exact: true })).toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: 'Open chat' }).click()
    const chatInput = page.getByLabel('Chat message')
    await chatInput.fill('What is the exact total contract value in dollars?')
    await page.getByRole('button', { name: 'Send message' }).click()

    // "contract" and "dollars" both match the contract-marker set, no history
    // markers present, so this must classify as 'contract' — the memory
    // layer must not have weakened the pre-existing hallucination guard for
    // that classification: the refusal phrase is exactly as before.
    const assistantMessage = page.getByTestId('assistant-message').first()
    await expect(assistantMessage).toBeVisible({ timeout: 20_000 })
    await expect(assistantMessage).toHaveAttribute('data-source-type', 'contract')
    await expect(page.getByText('I cannot find this in the document.')).toBeVisible()
  })
})
