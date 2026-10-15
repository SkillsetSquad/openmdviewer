import { describe, expect, it } from "vitest";
import {
  bytesHash,
  contentHash,
  DiskFileConflict,
  encodeDiskContent,
  readDiskFile,
  writeDiskFile,
} from "../src/lib/local-files";
const encode = (text: string) => new TextEncoder().encode(text);
class Disk {
  bytes: Uint8Array;
  name = "Original.md";
  opened = 0;
  written = 0;
  closed = 0;
  aborted = 0;
  duringOpen?: () => void;
  duringWrite?: () => void;
  duringClose?: () => void;
  failure?: "write" | "close";
  constructor(content: string | Uint8Array) {
    this.bytes = typeof content === "string" ? encode(content) : content;
  }
  handle() {
    return {
      kind: "file",
      name: this.name,
      getFile: async () => new File([this.bytes as BlobPart], this.name),
      createWritable: async (options: { mode: string }) => {
        expect(options.mode).toBe("exclusive");
        this.opened++;
        this.duringOpen?.();
        let staged: Uint8Array;
        return {
          write: async (blob: Blob) => {
            this.written++;
            if (this.failure === "write") throw new Error("Quota exhausted");
            staged = new Uint8Array(await blob.arrayBuffer());
            this.duringWrite?.();
          },
          close: async () => {
            if (this.failure === "close") throw new Error("Commit refused");
            this.bytes = staged;
            this.closed++;
            this.duringClose?.();
          },
          abort: async () => {
            this.aborted++;
          },
        };
      },
    } as unknown as FileSystemFileHandle;
  }
  text() {
    return new TextDecoder().decode(this.bytes);
  }
}
describe("explicit checked local file writes", () => {
  it("preserves a BOM and CRLF convention, verifies bytes, and does not rewrite an unchanged file", async () => {
    const disk = new Disk("\ufeff# Original\r\n\r\nKeep bytes.\r\n"),
      handle = disk.handle();
    const original = await readDiskFile(handle);
    expect(original).toMatchObject({
      bom: true,
      lineEnding: "crlf",
      content: "# Original\r\n\r\nKeep bytes.\r\n",
    });
    expect(
      await writeDiskFile(
        handle,
        original.content,
        original.hash,
        async () => {},
      ),
    ).toMatchObject({ changed: false });
    expect(disk.opened).toBe(0);
    const saved = await writeDiskFile(
      handle,
      "# Updated\n\nSaved.\n",
      original.hash,
      async () => {},
    );
    expect(saved.changed).toBe(true);
    expect(disk.bytes.slice(0, 3)).toEqual(new Uint8Array([239, 187, 191]));
    expect(disk.text()).toBe("# Updated\r\n\r\nSaved.\r\n");
    expect(saved.disk.hash).toBe(await bytesHash(disk.bytes));
    expect(disk.closed).toBe(1);
  });
  it("distinguishes byte changes even when timestamps, sizes or decoded content could appear unchanged", async () => {
    const disk = new Disk("one"),
      handle = disk.handle(),
      baseline = await readDiskFile(handle);
    disk.bytes = encode("two");
    await expect(
      writeDiskFile(handle, "browser", baseline.hash, async () => {}),
    ).rejects.toBeInstanceOf(DiskFileConflict);
    expect(disk.text()).toBe("two");
    expect(disk.opened).toBe(0);
    expect(await bytesHash(encode("\ufefftwo"))).not.toBe(
      await contentHash("two"),
    );
  });
  it("aborts a staged stream when another application changes the original during opening or writing", async () => {
    for (const phase of ["duringOpen", "duringWrite"] as const) {
      const disk = new Disk("original"),
        handle = disk.handle(),
        baseline = await readDiskFile(handle);
      disk[phase] = () => {
        disk.bytes = encode("external");
      };
      await expect(
        writeDiskFile(handle, "browser", baseline.hash, async () => {}),
      ).rejects.toBeInstanceOf(DiskFileConflict);
      expect(disk.text()).toBe("external");
      expect(disk.aborted).toBe(1);
      expect(disk.closed).toBe(0);
    }
  });
  it("checks the current browser document and connection again before committing staged bytes", async () => {
    const disk = new Disk("original"),
      handle = disk.handle(),
      baseline = await readDiskFile(handle);
    let checks = 0;
    await expect(
      writeDiskFile(handle, "browser", baseline.hash, async () => {
        if (++checks === 2) throw new Error("Browser document changed");
      }),
    ).rejects.toThrow("Browser document changed");
    expect(disk.text()).toBe("original");
    expect(disk.aborted).toBe(1);
    expect(disk.closed).toBe(0);
  });
  it("does not claim success after write/close failures or an unverified committed file", async () => {
    for (const failure of ["write", "close"] as const) {
      const disk = new Disk("original"),
        handle = disk.handle(),
        baseline = await readDiskFile(handle);
      disk.failure = failure;
      await expect(
        writeDiskFile(handle, "browser", baseline.hash, async () => {}),
      ).rejects.toThrow();
      expect(disk.text()).toBe("original");
      expect(disk.aborted).toBe(1);
    }
    const disk = new Disk("original"),
      handle = disk.handle(),
      baseline = await readDiskFile(handle);
    disk.duringClose = () => {
      disk.bytes = encode("changed after close");
    };
    await expect(
      writeDiskFile(handle, "browser", baseline.hash, async () => {}),
    ).rejects.toThrow("could not be verified");
    expect(disk.aborted).toBe(0);
    expect(disk.text()).toBe("changed after close");
  });
  it("rejects unsupported/binary encodings and excessive files before any write, and retains mixed line endings", async () => {
    for (const bytes of [new Uint8Array([255]), encode("null\0byte")])
      await expect(readDiskFile(new Disk(bytes).handle())).rejects.toThrow(
        /UTF-8|NUL/,
      );
    const unsupported = new Disk("data");
    unsupported.name = "Archive.zip";
    await expect(readDiskFile(unsupported.handle())).rejects.toThrow(
      "supported Markdown",
    );
    const handle = {
      getFile: async () => ({ name: "Large.md", size: 31 * 1024 * 1024 }),
    } as unknown as FileSystemFileHandle;
    await expect(readDiskFile(handle)).rejects.toThrow("30 MB");
    const mixed = await readDiskFile(new Disk("one\r\ntwo\nthree\r").handle());
    expect(mixed.lineEnding).toBe("mixed");
    expect(
      new TextDecoder().decode(encodeDiskContent(mixed.content, mixed)),
    ).toBe(mixed.content);
  });
});

it("rejects unreadable browser strings before opening or overwriting a disk file", async () => {
  for (const content of [
    "bad\0text",
    "incomplete \ud800",
    "incomplete \udc00",
  ]) {
    const disk = new Disk("original bytes"),
      handle = disk.handle(),
      original = await readDiskFile(handle);
    await expect(
      writeDiskFile(handle, content, original.hash, async () => {}),
    ).rejects.toThrow(/NUL|Unicode/);
    expect(disk.opened).toBe(0);
    expect(disk.text()).toBe("original bytes");
  }
});
it("retains a literal leading BOM character in browser text without growing encoding markers on repeat saves", async () => {
  const disk = new Disk(""),
    handle = disk.handle(),
    original = await readDiskFile(handle),
    content = "\ufeff# Literal leading character\n";
  const first = await writeDiskFile(
    handle,
    content,
    original.hash,
    async () => {},
  );
  expect(first.disk.content).toBe(content);
  const second = await writeDiskFile(
    handle,
    content,
    first.disk.hash,
    async () => {},
  );
  expect(second.changed).toBe(false);
  expect(disk.closed).toBe(1);
});
