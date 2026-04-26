import { chromium } from 'playwright'

const APP_URL = process.env.MALY_APP_URL || 'http://127.0.0.1:5177'

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const notes = []

  await page.goto(APP_URL, { waitUntil: 'networkidle' })
  await page.getByText('Fresh local chat').waitFor()
  notes.push('loaded chat shell')

  const initialDock = await page.locator('.artifact-dock').count()
  if (initialDock !== 0) {
    throw new Error('artifact dock should be closed initially')
  }
  notes.push('artifact split closed by default')

  await page.getByRole('button', { name: 'Open 3x Qwen workbench' }).click()
  await page.getByText('Qwen workbench').waitFor()
  await page.getByText('3x Qwen split compute').waitFor()
  notes.push('workbench drawer opens')
  await page.getByRole('button', { name: 'Close workbench' }).click()

  await page.getByRole('button', { name: 'Open task checklist' }).click()
  await page.getByPlaceholder('Add task').fill('Verify browser smoke')
  await page.getByRole('button', { name: 'Add task' }).click()
  await page.locator('input[value="Verify browser smoke"]').waitFor()
  notes.push('task checklist adds rows')
  await page.getByRole('button', { name: 'Close tasks' }).click()

  await page.getByRole('button', { name: 'Open branches' }).click()
  await page.getByPlaceholder('Branch name').fill('Experiment')
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await page.getByText('Experiment').first().waitFor()
  notes.push('branch creation works')
  await page.getByRole('button', { name: 'Close branches' }).click()

  await page.getByRole('button', { name: 'Open prompt templates' }).click()
  await page.getByRole('button', { name: 'Web game' }).click()
  const draft = await page.locator('textarea[placeholder="Message Maly AI"]').inputValue()
  if (!draft.includes('Build a polished browser game')) {
    throw new Error('template did not populate composer')
  }
  notes.push('template fills composer')

  await page.getByRole('button', { name: 'Open tools' }).click()
  await page.getByText('Models and runner').waitFor()
  await page.getByText('qwen3.5:0.8b').first().waitFor()
  await page.getByRole('button', { name: 'Plan tools' }).click()
  await page.getByText('web_search').waitFor()
  notes.push('tool planner works')

  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await page.getByText('Maly runner ready').waitFor()
  notes.push('code runner output works')

  await page.getByLabel('Runner type').selectOption('html')
  await page.getByLabel('Snippet').fill('<main><h1>Rendered artifact</h1><p>Split on demand.</p></main>')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await page.locator('.artifact-dock').waitFor()
  notes.push('HTML runner opens artifact split on demand')
  await page.getByRole('button', { name: 'Close tools' }).click()

  await page.getByRole('button', { name: 'Open workspace' }).click()
  await page.getByText('Local files').waitFor()
  await page.getByText('package.json').waitFor()
  notes.push('workspace tree loads')
  await page.getByRole('button', { name: 'Close workspace' }).click()

  await page.getByRole('button', { name: 'Open Google Workspace' }).click()
  await page.getByText('Sign in and sync').waitFor()
  await page.getByText(/OAuth (configured|not configured)/).waitFor()
  notes.push('google workspace drawer opens')

  await browser.close()
  console.log(JSON.stringify({ ok: true, notes }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
