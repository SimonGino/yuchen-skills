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

export function parsePositiveInt(input: string, flagName: string): number {
  const value = Number.parseInt(input, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${flagName} must be a positive integer`);
  }
  return value;
}

type ArgParserOptions = {
  usage?: string;
};

export function createArgParser<T>(
  initial: T,
  handlers: Map<string, ArgHandler<T>>,
  options?: ArgParserOptions,
): (argv: string[]) => T {
  return (argv: string[]): T => {
    const result = structuredClone(initial);

    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];
      if (!arg) continue;

      if ((arg === "--help" || arg === "-h") && options?.usage) {
        console.log(options.usage);
        process.exit(0);
      }

      const handler = handlers.get(arg);
      if (handler) {
        const { nextIndex } = handler(result, argv, i);
        i = nextIndex;
        continue;
      }

      if (arg.startsWith("-")) {
        throw new Error(`Unknown option: ${arg}`);
      }
    }

    return result;
  };
}
