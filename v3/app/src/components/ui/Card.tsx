// SOURCE: docs/RNG_Ops_v3_Project_Memory.md §12.4 — Cards / panels.
//
// Single component, no sub-components by design. Composition is via children.
// Defaults: Charcoal Steel surface, Steel Gray hairline border, 8px radius,
// shadow 0 2px 12px rgba(0,0,0,0.5), 24px padding (within spec's 20–24px).
// Override any default via className — twMerge in cn() resolves conflicts.

import * as React from "react";
import { cn } from "@/lib/cn";

export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "bg-rng-bg-surface border border-rng-border rounded-card shadow-card p-6",
      className,
    )}
    {...props}
  />
));
Card.displayName = "Card";
