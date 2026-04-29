// SOURCE: docs/RNG_Ops_v3_Project_Memory.md §12.5 — Status badge palette.
//
// Five states (one entry per row of §12.5):
//   - pending:       Vapor outline + text. Roster row not yet scored.
//   - recorded:      NV Green filled, Forge Black text. Roster row scored.
//   - edited:        Safety Yellow filled, Forge Black text. Has prior history.
//   - sync_conflict: Brand Red filled, Crisp White text. Conflicts queue.
//   - synced:        NV Green outline + text. Tablet sync indicator.
//
// Default behavior: <StatusBadge variant="recorded" /> renders "RECORDED".
// Override label via children: <StatusBadge variant="recorded">RECORDED 14:32</StatusBadge>.
// STATUS_LABELS is the single source of truth for §12.5 spec text.

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const statusBadgeVariants = cva(
  "inline-flex items-center font-body font-bold uppercase tracking-display text-xs px-3 py-1 rounded-action",
  {
    variants: {
      variant: {
        pending:
          "border border-rng-text-body text-rng-text-body bg-transparent",
        recorded: "bg-rng-status-ok text-rng-bg-base",
        edited: "bg-rng-status-edited text-rng-bg-base",
        sync_conflict: "bg-rng-status-error text-rng-text-primary",
        synced:
          "border border-rng-status-ok text-rng-status-ok bg-transparent",
      },
    },
    defaultVariants: { variant: "pending" },
  },
);

type StatusBadgeVariant = NonNullable<
  VariantProps<typeof statusBadgeVariants>["variant"]
>;

const STATUS_LABELS: Record<StatusBadgeVariant, string> = {
  pending: "PENDING",
  recorded: "RECORDED",
  edited: "EDITED",
  sync_conflict: "SYNC CONFLICT",
  synced: "SYNCED",
};

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusBadgeVariants> {}

export function StatusBadge({
  variant,
  className,
  children,
  ...rest
}: StatusBadgeProps) {
  // cva's variant prop type permits null; coerce to the default so the
  // STATUS_LABELS lookup below is type-safe and the rendered class set is
  // deterministic.
  const v: StatusBadgeVariant = variant ?? "pending";
  return (
    <span
      className={cn(statusBadgeVariants({ variant: v }), className)}
      {...rest}
    >
      {children ?? STATUS_LABELS[v]}
    </span>
  );
}

export { statusBadgeVariants, STATUS_LABELS };
export type { StatusBadgeVariant };
