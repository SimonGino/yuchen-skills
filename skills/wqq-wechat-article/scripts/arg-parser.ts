// Shared utilities for argument parsing

export type ArgHandler<T> = (
  args: T,
  argv: string[],
  index: number
) => { nextIndex: number };

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

export function createArgParser<T>(
  initial: T,
  handlers: Map<string, ArgHandler<T>>
): (argv: string[]) => T {
  return (argv: string[]): T => {
    const result = { ...initial };
    const positional: string[] = [];

    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];
      if (!arg) continue;

      const handler = handlers.get(arg);
      if (handler) {
        const { nextIndex } = handler(result, argv, i);
        i = nextIndex;
        continue;
      }

      if (arg.startsWith("-")) {
        throw new Error(`Unknown option: ${arg}`);
      }

      positional.push(arg);
    }

    return result;
  };
}
