import z from "zod"
import { Tool } from "./tool"
import { Todo } from "../session/todo"

export const TodoWriteTool = Tool.define("todowrite", {
  description: `Use this tool to create and manage a structured task list for the current session. This helps track progress, organize complex tasks, and show the user what you are doing step by step.

## When to use this tool
Use proactively in these scenarios:
1. Complex multi-step tasks — when a task requires 3 or more distinct steps (e.g. "analyze my finances", "create a savings plan")
2. User provides multiple requests in one message
3. After receiving new instructions — capture requirements as todos immediately
4. After completing a task — mark it complete and add follow-up tasks if needed
5. When starting work on a todo — mark it in_progress BEFORE doing it

## When NOT to use this tool
- Single, straightforward tasks (e.g. "what is my balance?", "log a $50 expense")
- Purely conversational or informational questions

## Task states
- pending: not yet started
- in_progress: currently working on (only ONE at a time)
- completed: finished successfully
- cancelled: no longer needed

## Rules
- Only ONE task in_progress at a time
- Mark tasks completed IMMEDIATELY after finishing — do not batch completions
- Update the list after EVERY meaningful action
- When doing a financial analysis, create todos for each tool you will call before calling them

## Example: "analyze my finances and give me a savings plan"
Create todos first:
1. [high] Check active alerts — pending
2. [high] Analyze expenses this month — pending
3. [medium] Review budget status — pending
4. [medium] Check goal trajectory — pending
5. [medium] Calculate savings rate — pending
6. [high] Generate savings plan recommendations — pending

Then execute them one by one, marking in_progress → completed as you go.`,

  parameters: z.object({
    todos: z.array(Todo.Info).describe("The complete updated todo list (replaces existing list)"),
  }),

  async execute({ todos }, ctx) {
    Todo.update({ sessionID: ctx.sessionID, todos })
    const pending = todos.filter((t) => t.status !== "completed" && t.status !== "cancelled").length
    const completed = todos.filter((t) => t.status === "completed").length
    return {
      title: `${pending} pending · ${completed} done`,
      output: JSON.stringify(todos, null, 2),
      metadata: { todos },
    }
  },
})

export const TodoReadTool = Tool.define("todoread", {
  description: "Read the current todo list for this session. Use this to check task status before adding new todos or to resume after an interruption.",
  parameters: z.object({}),
  async execute(_params, ctx) {
    const todos = Todo.get(ctx.sessionID)
    const pending = todos.filter((t) => t.status !== "completed" && t.status !== "cancelled").length
    return {
      title: `${pending} todos remaining`,
      output: todos.length === 0 ? "No todos yet." : JSON.stringify(todos, null, 2),
      metadata: { todos },
    }
  },
})
