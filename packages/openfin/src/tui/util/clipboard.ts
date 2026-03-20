import { platform } from "os"
import { tmpdir } from "os"
import path from "path"
import fs from "fs/promises"
import { execFile } from "child_process"
import { promisify } from "util"

const execFileAsync = promisify(execFile)

export interface ClipboardImage {
  data: string // base64
  mime: string
  filename: string
}

/**
 * Attempts to read an image from the system clipboard.
 * Returns undefined if no image is available or the platform is unsupported.
 */
export async function readClipboardImage(): Promise<ClipboardImage | undefined> {
  const os = platform()

  if (os === "darwin") {
    const tmpfile = path.join(tmpdir(), `openfin-clipboard-${Date.now()}.png`)
    try {
      await execFileAsync("osascript", [
        "-e", 'set imageData to the clipboard as "PNGf"',
        "-e", `set fileRef to open for access POSIX file "${tmpfile}" with write permission`,
        "-e", "set eof fileRef to 0",
        "-e", "write imageData to fileRef",
        "-e", "close access fileRef",
      ])
      const buffer = await fs.readFile(tmpfile)
      if (buffer.length === 0) return undefined
      return { data: buffer.toString("base64"), mime: "image/png", filename: "clipboard.png" }
    } catch {
      return undefined
    } finally {
      await fs.rm(tmpfile, { force: true }).catch(() => {})
    }
  }

  if (os === "linux") {
    // Try Wayland first
    try {
      const { stdout } = await execFileAsync("wl-paste", ["-t", "image/png"])
      if (stdout.length > 0) {
        return { data: Buffer.from(stdout).toString("base64"), mime: "image/png", filename: "clipboard.png" }
      }
    } catch {}

    // Try X11
    try {
      const { stdout } = await execFileAsync("xclip", ["-selection", "clipboard", "-t", "image/png", "-o"])
      if (stdout.length > 0) {
        return { data: Buffer.from(stdout).toString("base64"), mime: "image/png", filename: "clipboard.png" }
      }
    } catch {}
  }

  return undefined
}
