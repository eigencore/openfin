/**
 * Skills — markdown files that inject extra context into the system prompt.
 *
 * A skill is a SKILL.md file with YAML frontmatter:
 *
 *   ---
 *   name: trading
 *   description: Technical analysis and trading strategies for MX/US markets
 *   ---
 *   # Trading Guide
 *   ...content...
 *
 * Skill directories (loaded in order, later entries override earlier ones):
 *   1. ~/.openfin/skills/**\/SKILL.md  — global (user-level)
 *   2. .openfin/skills/**\/SKILL.md    — project-level (relative to cwd)
 */

import fs from "fs/promises"
import path from "path"
import { Global } from "../global/index"

export interface SkillInfo {
  name: string
  description: string
  location: string
  content: string
}

// ── Frontmatter parser ────────────────────────────────────────────────────────

function parseFrontmatter(raw: string): { data: Record<string, string>; content: string } | null {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return null

  const data: Record<string, string> = {}
  for (const line of match[1]!.split("\n")) {
    const colon = line.indexOf(":")
    if (colon === -1) continue
    const key = line.slice(0, colon).trim()
    const value = line.slice(colon + 1).trim()
    if (key) data[key] = value
  }

  return { data, content: match[2]!.trim() }
}

// ── File scanner ──────────────────────────────────────────────────────────────

async function scanDir(dir: string): Promise<SkillInfo[]> {
  const skills: SkillInfo[] = []

  async function walk(current: string) {
    let entries: { name: string; isDirectory: boolean; isFile: boolean }[]
    try {
      const raw = await fs.readdir(current, { withFileTypes: true })
      entries = raw.map((e) => ({ name: e.name, isDirectory: e.isDirectory(), isFile: e.isFile() }))
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory) {
        await walk(fullPath)
      } else if (entry.isFile && entry.name === "SKILL.md") {
        const raw = await fs.readFile(fullPath, "utf-8").catch(() => null)
        if (!raw) continue

        const parsed = parseFrontmatter(raw)
        if (!parsed) continue

        const { name, description } = parsed.data
        if (!name || !description) continue

        skills.push({ name, description, location: fullPath, content: parsed.content })
      }
    }
  }

  await walk(dir)
  return skills
}

// ── Public API ────────────────────────────────────────────────────────────────

export namespace Skill {
  /**
   * Load all skills from global (~/.openfin/skills/) and project-level
   * (.openfin/skills/ relative to cwd) directories.
   * Project-level skills override global ones with the same name.
   */
  export async function load(): Promise<SkillInfo[]> {
    const globalDir = path.join(Global.Path.data, "skills")
    const projectDir = path.join(process.cwd(), ".openfin", "skills")

    const [globalSkills, projectSkills] = await Promise.all([scanDir(globalDir), scanDir(projectDir)])

    // Merge: project overrides global
    const map = new Map<string, SkillInfo>()
    for (const s of globalSkills) map.set(s.name, s)
    for (const s of projectSkills) map.set(s.name, s)

    return Array.from(map.values())
  }

  /**
   * Format skills list for injection into the system prompt.
   * verbose=true → XML list (name+description+location only, no content) — for system prompt
   * verbose=false → markdown bullet list — for tool description
   */
  export function fmt(skills: SkillInfo[], opts: { verbose: boolean } = { verbose: true }): string | undefined {
    if (skills.length === 0) return undefined

    if (opts.verbose) {
      return [
        "<available_skills>",
        ...skills.flatMap((skill) => [
          `  <skill>`,
          `    <name>${skill.name}</name>`,
          `    <description>${skill.description}</description>`,
          `    <location>${skill.location}</location>`,
          `  </skill>`,
        ]),
        "</available_skills>",
      ].join("\n")
    }

    return ["## Available Skills", ...skills.map((skill) => `- **${skill.name}**: ${skill.description}`)].join("\n")
  }
}
