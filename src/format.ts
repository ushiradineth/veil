import { encode } from "@toon-format/toon";

export function toToon(data: unknown): string {
  try {
    return encode(data as never);
  } catch {
    if (typeof data === "string") {
      return data;
    }
    return String(data);
  }
}
