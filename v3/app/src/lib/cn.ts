// Tiny class-name utility used by every primitive in components/ui/.
// clsx merges conditionals; tailwind-merge resolves conflicts between
// utilities (e.g. consumer overriding a default `p-6` with `p-4` wins).
//
// SOURCE: shadcn convention.

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
