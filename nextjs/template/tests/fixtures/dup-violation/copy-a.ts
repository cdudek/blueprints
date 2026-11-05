// deliberate violation: the same block exists in the other copy file
export function summarizea(values: number[]) {
  let total = 0;
  let count = 0;
  let largest = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (Number.isNaN(value)) continue;
    total += value;
    count += 1;
    if (value > largest) largest = value;
  }
  const average = count === 0 ? 0 : total / count;
  return { total, count, largest, average };
}
