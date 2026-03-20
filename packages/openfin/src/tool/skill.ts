import z from "zod"
import { Tool } from "./tool"
import { Skill } from "../skill/skill"

export const SkillTool = Tool.define("skill", {
  description: [
    "Load a specialized skill that provides domain-specific instructions and workflows.",
    "",
    "When you recognize that a task matches one of the available skills listed in the system prompt, use this tool to load the full skill instructions.",
    "",
    'Tool output includes a `<skill_content name="...">` block with the loaded content.',
  ].join("\n"),
  parameters: z.object({
    name: z.string().describe("The name of the skill from available_skills in the system prompt"),
  }),
  async execute({ name }) {
    const skills = await Skill.load()
    const skill = skills.find((s) => s.name === name)

    if (!skill) {
      const available = skills.map((s) => s.name).join(", ")
      throw new Error(`Skill "${name}" not found. Available skills: ${available || "none"}`)
    }

    return {
      title: `Loaded skill: ${skill.name}`,
      output: [
        `<skill_content name="${skill.name}">`,
        `# Skill: ${skill.name}`,
        "",
        skill.content.trim(),
        "",
        "</skill_content>",
      ].join("\n"),
      metadata: { name: skill.name, location: skill.location },
    }
  },
})
