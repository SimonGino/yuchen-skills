// Shared utilities for argument parsing

export function takeOne(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

export function takeMany(argv: string[], index: number): { items: string[]; nextIndex: number } {
  const items: string[] = [];
  let j = index + 1;

  while (j < argv.length) {
    const v = argv[j];
    if (!v || v.startsWith("-")) break;
    items.push(v);
    j++;
  }

  return { items, nextIndex: j - 1 };
}
