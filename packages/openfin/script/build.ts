#!/usr/bin/env bun

/**
 * Build script — compiles openfin server into native binaries for each platform.
 *
 * Usage:
 *   bun run script/build.ts              # build all targets
 *   bun run script/build.ts --single     # build only current platform
 */

import { $ } from "bun"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dir = path.resolve(__dirname, "..")
process.chdir(dir)

const version = process.env.OPENFIN_VERSION || (await import("../package.json")).version
const singleFlag = process.argv.includes("--single")

const targets = [
  { os: "darwin", arch: "arm64" },
  { os: "darwin", arch: "x64" },
  { os: "linux", arch: "arm64" },
  { os: "linux", arch: "x64" },
  { os: "win32", arch: "x64" },
] as const

const currentOs = process.platform
const currentArch = process.arch

const activeTargets = singleFlag
  ? targets.filter((t) => t.os === currentOs && t.arch === currentArch)
  : targets

// Load migrations and embed them into the binary
const migrationDir = path.join(dir, "migration")
const migrations: { sql: string; timestamp: number; name: string }[] = []

if (fs.existsSync(migrationDir)) {
  const dirs = fs
    .readdirSync(migrationDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{14}/.test(e.name))
    .map((e) => e.name)
    .sort()

  for (const name of dirs) {
    const file = path.join(migrationDir, name, "migration.sql")
    if (!fs.existsSync(file)) continue
    const sql = await Bun.file(file).text()
    const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(name)
    const timestamp = match
      ? Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +match[6])
      : 0
    migrations.push({ sql, timestamp, name })
  }
}

console.log(`Building openfin v${version} — ${activeTargets.length} target(s)`)
console.log(`Loaded ${migrations.length} migration(s)\n`)

fs.mkdirSync("dist", { recursive: true })

for (const { os, arch } of activeTargets) {
  const pkgName = `openfin-${os === "win32" ? "windows" : os}-${arch}`
  const binary = os === "win32" ? "openfin.exe" : "openfin"
  const outDir = path.join("dist", pkgName, "bin")
  const outFile = path.join(outDir, binary)

  fs.mkdirSync(outDir, { recursive: true })

  // Map to bun's target string
  const bunOs = os === "win32" ? "windows" : os
  const target = `bun-${bunOs}-${arch}`

  console.log(`  → ${pkgName}`)

  await $`bun build src/index.ts \
    --compile \
    --target=${target} \
    --outfile=${outFile} \
    --define OPENFIN_VERSION='"${version}"' \
    --define 'process.env.NODE_ENV="production"'`

  // Write platform package.json for npm publish
  const pkgJson = {
    name: pkgName,
    version,
    description: `openfin binary for ${os}-${arch}`,
    os: [os === "win32" ? "win32" : os],
    cpu: [arch],
    bin: { openfin: `./bin/${binary}` },
    files: ["bin"],
    license: "MIT",
    repository: {
      type: "git",
      url: "https://github.com/eigencore/openfin",
    },
  }

  await Bun.write(path.join("dist", pkgName, "package.json"), JSON.stringify(pkgJson, null, 2))
}

console.log("\nBuild complete → dist/")
