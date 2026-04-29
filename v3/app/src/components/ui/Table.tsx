// SOURCE: docs/RNG_Ops_v3_Project_Memory.md §12.4 — Tables.
//
// Single component styling native <thead>/<tbody>/<tr>/<th>/<td> children
// via Tailwind arbitrary descendant selectors. Header uses Gunmetal
// (the OR-branch of §12.4's "Brand Blue 20% opacity OR Gunmetal" rule —
// avoids the opacity-token complication). Body rows alternate Charcoal
// Steel and Gunmetal. Cell borders Steel Gray. Cell text Vapor.
//
// Consumer writes vanilla HTML inside <Table>:
//   <Table>
//     <thead><tr><th>Bib</th><th>Name</th></tr></thead>
//     <tbody><tr><td>0142</td><td>Adams</td></tr></tbody>
//   </Table>
//
// Wrapped in a horizontally-scrolling div so narrow viewports don't break
// the layout (iPads in portrait, Roster screens with many columns).

import * as React from "react";
import { cn } from "@/lib/cn";

export const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="w-full overflow-auto">
    <table
      ref={ref}
      className={cn(
        "w-full text-rng-text-body border-collapse",
        // Header
        "[&_thead]:bg-rng-bg-elevated",
        "[&_thead_th]:text-rng-text-primary [&_thead_th]:font-display [&_thead_th]:font-bold",
        "[&_thead_th]:uppercase [&_thead_th]:tracking-display [&_thead_th]:text-left",
        "[&_thead_th]:px-4 [&_thead_th]:py-2",
        // Body
        "[&_tbody_tr]:border-b [&_tbody_tr]:border-rng-border",
        "[&_tbody_tr:nth-child(even)]:bg-rng-bg-elevated",
        "[&_tbody_tr:nth-child(odd)]:bg-rng-bg-surface",
        "[&_tbody_td]:px-4 [&_tbody_td]:py-2",
        className,
      )}
      {...props}
    />
  </div>
));
Table.displayName = "Table";
