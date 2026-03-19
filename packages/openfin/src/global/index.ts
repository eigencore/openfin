import fs from "fs/promises"
import path from "path"
import os from "os"

const app = "openfin"
const base = path.join(os.homedir(), `.${app}`)

export namespace Global {
  export const Path = {
    get home() {
      return process.env.OPENFIN_TEST_HOME || os.homedir()
    },
    data: base,
    bin: path.join(base, "bin"),
    log: path.join(base, "log"),
    cache: path.join(base, "cache"),
    config: path.join(base, "config"),
    state: path.join(base, "state"),
  }
}

await Promise.all([
  fs.mkdir(Global.Path.data, { recursive: true }),
  fs.mkdir(Global.Path.bin, { recursive: true }),
  fs.mkdir(Global.Path.log, { recursive: true }),
  fs.mkdir(Global.Path.cache, { recursive: true }),
  fs.mkdir(Global.Path.config, { recursive: true }),
  fs.mkdir(Global.Path.state, { recursive: true }),
])
