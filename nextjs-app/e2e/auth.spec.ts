import { test, expect } from '@playwright/test'
import { deleteTestUser } from './helpers/supabaseAdmin'

test.describe('Authentication', () => {
  test('sign-up creates an account and redirects to the dashboard', async ({ page }) => {
    const email = `contractiq-e2e-signup-${Date.now()}@gmail.com`
    let userId: string | undefined

    await page.goto('/auth/signup')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill('test-password-123')

    const [signupResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/auth/v1/signup') && res.request().method() === 'POST'),
      page.getByRole('button', { name: 'Create account' }).click(),
    ])
    const signupBody = await signupResponse.json()
    userId = signupBody.user?.id ?? signupBody.id

    await page.waitForURL('**/dashboard')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

    if (userId) await deleteTestUser(userId)
  })

  test('sign-in with invalid credentials shows an error', async ({ page }) => {
    await page.goto('/auth/signin')
    await page.getByLabel('Email').fill('nonexistent-e2e-user@gmail.com')
    await page.getByLabel('Password').fill('wrongpassword123')
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.getByText('Incorrect email or password.')).toBeVisible()
    await expect(page).toHaveURL(/\/auth\/signin/)
  })

  test('an unauthenticated visit to /dashboard redirects to sign-in', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForURL(/\/auth\/signin/)
  })

  test('sign-out redirects to the landing page and blocks further protected access', async ({ page }) => {
    // Uses its own throwaway account, signed in fresh here rather than via
    // the shared storageState fixture: Supabase's signOut() revokes the
    // session server-side, which would otherwise invalidate every other
    // spec file relying on the same saved session.
    const email = `contractiq-e2e-signout-${Date.now()}@gmail.com`
    let userId: string | undefined

    await page.goto('/auth/signup')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill('test-password-123')
    const [signupResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/auth/v1/signup') && res.request().method() === 'POST'),
      page.getByRole('button', { name: 'Create account' }).click(),
    ])
    const signupBody = await signupResponse.json()
    userId = signupBody.user?.id ?? signupBody.id
    await page.waitForURL('**/dashboard')

    await page.getByRole('button', { name: 'Sign out' }).click()
    await page.waitForURL('/')

    await page.goto('/dashboard')
    await page.waitForURL(/\/auth\/signin/)

    if (userId) await deleteTestUser(userId)
  })
})
