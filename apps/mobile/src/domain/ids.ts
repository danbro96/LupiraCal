/** Client half of the servers' DeterministicGuid: id = MD5(sourceKey) laid out as a .NET Guid. The client
 *  mints a sourceKey (UUIDv7) for offline creates and derives the SAME id the server will assign, so the
 *  mirror row, its occurrences, and follow-up ops can reference the aggregate before the create is acked —
 *  no temp-id reconciliation. MD5 itself comes from the platform (expo-crypto / node:crypto); this is the
 *  pure byte-order half, pinned against real .NET output in tests. */
export function guidFromMd5Hex(md5Hex: string): string {
  const h = md5Hex.toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(h)) throw new Error('guidFromMd5Hex expects 32 hex digits');
  const b = (i: number) => h.slice(i * 2, i * 2 + 2);
  // .NET Guid(byte[]): first three groups are little-endian int32/int16/int16; the rest verbatim.
  return `${b(3)}${b(2)}${b(1)}${b(0)}-${b(5)}${b(4)}-${b(7)}${b(6)}-${b(8)}${b(9)}-${b(10)}${b(11)}${b(12)}${b(13)}${b(14)}${b(15)}`;
}

/** ContactApi `Residency.StreamIdOf`'s key: the contact id in .NET's "D" form and the trimmed source key. */
export function residencyStreamKey(contactId: string, sourceKey: string): string {
  return `residency:${contactId.toLowerCase()}:${sourceKey.trim()}`;
}
