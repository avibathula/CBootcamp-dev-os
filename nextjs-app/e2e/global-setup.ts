import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3001'
const AUTH_DIR = path.join(__dirname, '.auth')

type SessionResponse = {
  access_token: string
  user: { id: string }
}

async function globalSetup() {
  if (!SUPABASE_URL || !ANON_KEY) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY must be set for E2E tests.')
  }

  const email = `contractiq-e2e-${Date.now()}@gmail.com`
  const password = 'e2e-test-password-123'

  // 1. Sign up a dedicated E2E test user.
  const signupResponse = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const session = (await signupResponse.json()) as SessionResponse
  if (!session.access_token) {
    throw new Error(`E2E setup: signup did not return a session — is email confirmation disabled? ${JSON.stringify(session)}`)
  }
  const userId = session.user.id
  const token = session.access_token

  // 2. Seed one fully-processed contract via direct API calls (bypassing the
  // UI) so most spec files can start from a populated results page without
  // each incurring their own extraction latency/cost. upload.spec.ts still
  // drives the real UI upload flow separately for genuine end-to-end coverage.
  const pdfBuffer = readFileSync(path.join(__dirname, '../__tests__/fixtures/sample-nda.pdf'))
  const formData = new FormData()
  formData.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), 'sample-nda.pdf')
  formData.append('contract_type', 'nda')

  const uploadResponse = await fetch(`${BASE_URL}/api/upload-contract`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })
  if (!uploadResponse.ok) {
    throw new Error(`E2E setup: upload failed (${uploadResponse.status}): ${await uploadResponse.text()}`)
  }
  const uploadBody = (await uploadResponse.json()) as { contract_id: string }
  const contractId = uploadBody.contract_id

  const processResponse = await fetch(`${BASE_URL}/api/process-contract`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ contract_id: contractId, custom_terms: ['Total contract value in dollars'] }),
  })
  if (!processResponse.ok) {
    throw new Error(`E2E setup: processing failed (${processResponse.status}): ${await processResponse.text()}`)
  }

  // 3. Log in through the real UI once and persist the authenticated cookie
  // state so every other spec file starts already signed in.
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto(`${BASE_URL}/auth/signin`)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(`${BASE_URL}/dashboard`)

  await context.storageState({ path: path.join(AUTH_DIR, 'user.json') })
  await browser.close()

  writeFileSync(
    path.join(AUTH_DIR, 'context.json'),
    JSON.stringify({ email, password, userId, contractId, token }, null, 2)
  )
}

export default globalSetup
