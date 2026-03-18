import fs from "fs/promises"
import path from "path"
import os from "os"

const app = "openfin"
const base = path.join(os.homedir(), `.${app}`)

export namespace Global {
  export const Path = {
    data: base,
    log: path.join(base, "log"),
    config: path.join(base, "config"),
  }
}

await Promise.all([
  fs.mkdir(Global.Path.data, { recursive: true }),
  fs.mkdir(Global.Path.log, { recursive: true }),
  fs.mkdir(Global.Path.config, { recursive: true }),
])
