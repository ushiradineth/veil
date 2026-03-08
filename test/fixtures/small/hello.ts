export function greet(name: string): string {
  return `Hello, ${name}!`;
}

export class Greeter {
  constructor(private prefix: string) {}

  greet(name: string): string {
    return `${this.prefix} ${name}!`;
  }
}

const DEFAULT_GREETING = "Hello";
