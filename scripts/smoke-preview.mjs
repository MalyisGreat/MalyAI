import { chromium } from 'playwright'

const APP_URL = process.env.MALY_APP_URL || 'http://127.0.0.1:5177'

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })

  await page.goto(APP_URL, { waitUntil: 'networkidle' })
  const result = await page.evaluate(async () => {
    const artifacts = await import('/src/lib/artifacts.ts')
    const js = artifacts.createCodeArtifact(
      'document.getElementById("maly-preview-root").innerHTML = "<h1>JS Preview OK</h1>"',
      'javascript',
      0,
      'smoke',
    )
    const css = artifacts.createCodeArtifact(
      'body { background: rgb(1, 2, 3); } .card { color: white; }',
      'css',
      1,
      'smoke',
    )

    return {
      jsKind: js?.previewKind,
      jsDocHasScript: js ? artifacts.getArtifactDocument(js).includes('JS Preview OK') : false,
      cssKind: css?.previewKind,
      cssDocHasStyle: css ? artifacts.getArtifactDocument(css).includes('background: rgb(1, 2, 3)') : false,
    }
  })

  await browser.close()
  console.log(JSON.stringify(result, null, 2))

  if (
    result.jsKind !== 'javascript' ||
    !result.jsDocHasScript ||
    result.cssKind !== 'css' ||
    !result.cssDocHasStyle
  ) {
    throw new Error('Preview artifact smoke failed')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
