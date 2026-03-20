#!/usr/bin/env bun

/**
 * Publish script — publishes platform packages + main package to npm,
 * then uploads binaries to GitHub Releases.
 *
 * Env vars:
 *   OPENFIN_VERSION  — version string (e.g. "0.1.0")
 *   GITHUB_TOKEN     — for creating GitHub release and uploading assets
 *   NPM_TOKEN        — for npm publish (set in CI via NODE_AUTH_TOKEN)
 */

import { $ } from "bun"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dir = path.resolve(__dirname, "..")
process.chdir(dir)

const version = process.env.OPENFIN_VERSION
if (!version) throw new Error("OPENFIN_VERSION is required")

const githubToken = process.env.GITHUB_TOKEN
const repo = "eigencore/openfin"
const tag = `v${version}`

const platforms = [
  "openfin-darwin-arm64",
  "openfin-darwin-x64",
  "openfin-linux-arm64",
  "openfin-linux-x64",
  "openfin-windows-x64",
]

// ── 1. Publish platform-specific packages ─────────────────────────────────
console.log("Publishing platform packages to npm...")

for (const pkg of platforms) {
  const pkgDir = path.join("dist", pkg)
  if (!fs.existsSync(pkgDir)) {
    console.warn(`  ⚠ dist/${pkg} not found — skipping`)
    continue
  }
  console.log(`  → ${pkg}`)
  await $`npm publish ${pkgDir} --access public`
}

// ── 2. Publish main openfin-ai package ────────────────────────────────────
console.log("\nPublishing openfin-ai to npm...")
await $`npm publish . --access public`

// ── 3. Create GitHub Release and upload binaries ──────────────────────────
if (!githubToken) {
  console.warn("\nGITHUB_TOKEN not set — skipping GitHub Release")
  process.exit(0)
}

console.log(`\nCreating GitHub release ${tag}...`)

// Create release
const releaseRes = await fetch(`https://api.github.com/repos/${repo}/releases`, {
  method: "POST",
  headers: {
    Authorization: `token ${githubToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    tag_name: tag,
    name: `openfin ${tag}`,
    body: `Release ${tag}`,
    draft: false,
    prerelease: false,
  }),
})

if (!releaseRes.ok) {
  const err = await releaseRes.text()
  throw new Error(`Failed to create release: ${err}`)
}

const release = (await releaseRes.json()) as { id: number; upload_url: string }
const uploadBase = release.upload_url.replace("{?name,label}", "")

// Upload each binary as a release asset
const assets = [
  { file: "dist/openfin-darwin-arm64/bin/openfin", name: "openfin-darwin-arm64" },
  { file: "dist/openfin-darwin-x64/bin/openfin", name: "openfin-darwin-x64" },
  { file: "dist/openfin-linux-arm64/bin/openfin", name: "openfin-linux-arm64" },
  { file: "dist/openfin-linux-x64/bin/openfin", name: "openfin-linux-x64" },
  { file: "dist/openfin-windows-x64/bin/openfin.exe", name: "openfin-windows-x64.exe" },
]

console.log("Uploading assets to GitHub release...")
for (const { file, name } of assets) {
  if (!fs.existsSync(file)) {
    console.warn(`  ⚠ ${file} not found — skipping`)
    continue
  }
  console.log(`  → ${name}`)
  const data = fs.readFileSync(file)
  const uploadRes = await fetch(`${uploadBase}?name=${name}`, {
    method: "POST",
    headers: {
      Authorization: `token ${githubToken}`,
      "Content-Type": "application/octet-stream",
    },
    body: data,
  })
  if (!uploadRes.ok) {
    console.error(`  ✗ Failed to upload ${name}: ${await uploadRes.text()}`)
  }
}

console.log(`\nRelease ${tag} published at https://github.com/${repo}/releases/tag/${tag}`)
