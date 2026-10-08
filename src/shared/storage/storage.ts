import { useCallback, useState } from "react";
export function readStored<T>(
  key: string,
  fallback: T,
  valid?: (value: unknown) => value is T,
): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const value: unknown = JSON.parse(raw);
    return valid && !valid(value) ? fallback : (value as T);
  } catch {
    return fallback;
  }
}
export function writeStored(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function useStored<T>(
  key: string,
  initial: T,
  valid?: (value: unknown) => value is T,
) {
  const [state, setState] = useState<T>(() => readStored(key, initial, valid));
  const [error, setError] = useState("");
  const update = useCallback(
    (value: T | ((previous: T) => T)) => {
      setState((previous) => {
        const next =
          typeof value === "function"
            ? (value as (p: T) => T)(previous)
            : value;
        if (!writeStored(key, next))
          setError(
            "Browser storage is full or unavailable. Export your draft before leaving.",
          );
        return next;
      });
    },
    [key],
  );
  return [state, update, error] as const;
}
export const storageKey = (scope: string, feature: string) =>
  `taskflow:v1:${scope}:${feature}`;
