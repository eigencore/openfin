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
import solidPlugin from "@opentui/solid/bun-plugin"
import pkg from "../package.json"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dir = path.resolve(__dirname, "..")
process.chdir(dir)

const version = process.env.OPENFIN_VERSION || pkg.version
const singleFlag = process.argv.includes("--single")

const allTargets = [
  { os: "darwin", arch: "arm64" },
  { os: "darwin", arch: "x64" },
  { os: "linux", arch: "arm64" },
  { os: "linux", arch: "x64" },
  { os: "win32", arch: "x64" },
] as const

const targets = singleFlag
  ? allTargets.filter((t) => t.os === process.platform && t.arch === process.arch)
  : allTargets

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

console.log(`Building openfin v${version} — ${targets.length} target(s)`)
console.log(`Loaded ${migrations.length} migration(s)\n`)

await $`rm -rf dist`

// Install @opentui/core for all platforms so cross-compilation works
if (!singleFlag) {
  await $`bun install --os="*" --cpu="*" @opentui/core@${pkg.dependencies["@opentui/core"]}`
}

for (const { os, arch } of targets) {
  const pkgName = `@eigencore/openfin-${os === "win32" ? "windows" : os}-${arch}`
  const dirName = `openfin-${os === "win32" ? "windows" : os}-${arch}`
  const binary = os === "win32" ? "openfin.exe" : "openfin"
  const outDir = path.join("dist", dirName, "bin")

  await $`mkdir -p ${outDir}`

  const bunTarget = `bun-${os === "win32" ? "windows" : os}-${arch}`

  console.log(`  → ${pkgName}`)

  const result = await Bun.build({
    entrypoints: [path.join(dir, "src/index.ts")],
    plugins: [solidPlugin],
    define: {
      OPENFIN_VERSION: `"${version}"`,
      "process.env.NODE_ENV": '"production"',
    },
    compile: {
      target: bunTarget as any,
      outfile: path.join(dir, outDir, binary),
    } as any,
  })

  if (!result.success) {
    for (const log of result.logs) console.error(log)
    process.exit(1)
  }

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

  await Bun.write(path.join("dist", dirName, "package.json"), JSON.stringify(pkgJson, null, 2))
}

console.log("\nBuild complete → dist/")
