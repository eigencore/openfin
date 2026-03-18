import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../storage/schema.sql"

export const SessionTable = sqliteTable(
  "session",
  {
    id: text().primaryKey(),
    project_id: text().notNull(),
    parent_id: text(),
    slug: text().notNull(),
    directory: text().notNull(),
    title: text().notNull(),
    version: text().notNull(),
    permission: text({ mode: "json" }),
    time_compacting: integer(),
    time_archived: integer(),
    ...Timestamps,
  },
  (table) => [index("session_project_idx").on(table.project_id)],
)

export const MessageTable = sqliteTable(
  "message",
  {
    id: text().primaryKey(),
    session_id: text()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    data: text({ mode: "json" }).notNull(),
    ...Timestamps,
  },
  (table) => [
    index("message_session_time_created_id_idx").on(table.session_id, table.time_created, table.id),
  ],
)

export const PartTable = sqliteTable(
  "part",
  {
    id: text().primaryKey(),
    message_id: text()
      .notNull()
      .references(() => MessageTable.id, { onDelete: "cascade" }),
    session_id: text().notNull(),
    data: text({ mode: "json" }).notNull(),
    ...Timestamps,
  },
  (table) => [
    index("part_message_id_id_idx").on(table.message_id, table.id),
    index("part_session_idx").on(table.session_id),
  ],
)
