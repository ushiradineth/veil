export function clampInt(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  const candidate =
    typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : fallback;
  return Math.min(max, Math.max(min, candidate));
}

export function trimQuery(value: string | undefined): string {
  return (value ?? "").trim();
}
