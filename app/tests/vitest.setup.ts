/** Vitest 5.1 error formatting needs Map.groupBy (Node ≥21). Polyfill for Node 20. */
if (typeof Map.groupBy !== 'function') {
  Map.groupBy = function groupBy<K, T>(
    items: Iterable<T>,
    keySelector: (item: T, index: number) => K,
  ): Map<K, T[]> {
    const map = new Map<K, T[]>()
    let index = 0
    for (const item of items) {
      const key = keySelector(item, index++)
      const group = map.get(key)
      if (group) group.push(item)
      else map.set(key, [item])
    }
    return map
  }
}
