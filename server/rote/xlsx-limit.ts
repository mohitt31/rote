import { inflateRawSync } from "node:zlib";
// Bound actual decompressed bytes before ExcelJS builds its workbook object graph.
export function checkXlsxArchive(data: Buffer, maxBytes = 25 * 1024 * 1024) {
  const end = data.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0 || end + 22 > data.length) throw Error("Invalid XLSX archive");
  const entries = data.readUInt16LE(end + 10);
  let offset = data.readUInt32LE(end + 16),
    expanded = 0;
  if (
    data.readUInt16LE(end + 4) ||
    data.readUInt16LE(end + 6) ||
    entries > 2000 ||
    entries === 0 ||
    offset === 0xffffffff
  )
    throw Error("Unsupported XLSX archive");
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > end || data.readUInt32LE(offset) !== 0x02014b50)
      throw Error("Invalid XLSX directory");
    const flags = data.readUInt16LE(offset + 8),
      method = data.readUInt16LE(offset + 10),
      compressed = data.readUInt32LE(offset + 20),
      size = data.readUInt32LE(offset + 24),
      local = data.readUInt32LE(offset + 42);
    if (
      flags & 1 ||
      size > maxBytes - expanded ||
      local + 30 > offset ||
      data.readUInt32LE(local) !== 0x04034b50
    )
      throw Error("XLSX archive exceeds limits or is unsupported");
    const start =
      local +
      30 +
      data.readUInt16LE(local + 26) +
      data.readUInt16LE(local + 28);
    if (start + compressed > offset) throw Error("Invalid XLSX member");
    const payload = data.subarray(start, start + compressed);
    const actual =
      method === 0
        ? payload
        : method === 8
          ? inflateRawSync(payload, {
              maxOutputLength: Math.max(1, maxBytes - expanded),
            })
          : null;
    if (
      !actual ||
      actual.length !== size ||
      expanded + actual.length > maxBytes
    )
      throw Error("XLSX expanded data exceeds limits");
    expanded += actual.length;
    offset +=
      46 +
      data.readUInt16LE(offset + 28) +
      data.readUInt16LE(offset + 30) +
      data.readUInt16LE(offset + 32);
  }
}
