import { test, expect } from '@playwright/test'
import path from 'path'
import { readFileSync } from 'fs'

test.use({ storageState: path.join(__dirname, '.auth/user.json') })

const context = JSON.parse(readFileSync(path.join(__dirname, '.auth/context.json'), 'utf-8')) as {
  contractId: string
}

test.describe('Contract chat — conversation memory (4-turn sequence)', () => {
  test('clause question, contextual follow-up, reload persistence, then a history-only question', async ({
    page,
  }) => {
    await page.goto(`/contracts/${context.contractId}`)
    await expect(page.getByTestId('key-terms-panel').getByText('Governing Law', { exact: true })).toBeVisible({
      timeout: 10_000,
    })

    await page.getByRole('button', { name: 'Open chat' }).click()
    const chatInput = page.getByLabel('Chat message')
    const assistantMessages = page.getByTestId('assistant-message')

    // --- Turn 1: a contract clause question — expect a [Page X] citation, source "Contract" ---
    await chatInput.fill('What is the term duration of this agreement?')
    await page.getByRole('button', { name: 'Send message' }).click()

    await expect(assistantMessages).toHaveCount(1, { timeout: 20_000 })
    await expect(assistantMessages.nth(0)).toHaveAttribute('data-source-type', 'contract')
    await expect(assistantMessages.nth(0).getByRole('button', { name: /\[Page \d+\]/ })).toBeVisible()

    // --- Turn 2: a follow-up that only makes sense with memory of turn 1 ---
    await chatInput.fill('How many years is that?')
    await page.getByRole('button', { name: 'Send message' }).click()

    await expect(assistantMessages).toHaveCount(2, { timeout: 20_000 })
    // Ambiguous phrasing (no explicit contract/history marker) falls back to
    // 'both' — retrieval still includes the contract text and prior turns,
    // so the model can resolve "that" via either source.
    await expect(assistantMessages.nth(1)).toHaveAttribute('data-source-type', 'both')

    // --- Turn 3: reload persistence — both prior turns must survive, with attribution ---
    await page.reload()
    await page.getByRole('button', { name: 'Open chat' }).click()
    await expect(page.getByText('What is the term duration of this agreement?')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('How many years is that?')).toBeVisible()
    await expect(assistantMessages).toHaveCount(2)
    await expect(assistantMessages.nth(0)).toHaveAttribute('data-source-type', 'contract')
    await expect(assistantMessages.nth(1)).toHaveAttribute('data-source-type', 'both')

    // --- Turn 4: a history-only question — no contract text should be used ---
    await chatInput.fill('What have I asked you so far?')
    await page.getByRole('button', { name: 'Send message' }).click()

    await expect(assistantMessages).toHaveCount(3, { timeout: 20_000 })
    await expect(assistantMessages.nth(2)).toHaveAttribute('data-source-type', 'history')
    await expect(assistantMessages.nth(2)).toContainText('[From conversation]')
  })
})
