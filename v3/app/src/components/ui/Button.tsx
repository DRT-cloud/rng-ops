// SOURCE: docs/RNG_Ops_v3_Project_Memory.md §12.4 — Button component patterns.
//
// Four variants:
//   - action: Brand Red filled, Crisp White text. Primary CTAs (APPROVE & RECORD).
//   - info:   Brand Blue 1.5px outline, Brand Blue text. Navigation, secondary actions.
//   - ghost:  Transparent, Vapor text. Tertiary low-emphasis actions.
//   - dns:    Brand Red 1.5px outline, Brand Red text. Action-class semantic for
//             irreversible-ish operations like the stage-tablet "DID NOT SHOOT" button.
//
// Hover treatments for info/dns use color-mix() per spec ("X at 15% opacity").
// Browser floor: Safari 16.2+ / Chrome 111+ / Firefox 113+. iPad target clears.
//
// asChild forwards rendering to a child element via Radix Slot — used in Phase 3
// to wrap a wouter <Link> without a nested <a><button> tree.

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center font-body font-bold uppercase tracking-display rounded-action px-4 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rng-info disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        action: "bg-rng-action text-rng-text-primary hover:bg-rng-action-hover",
        info: "border-[1.5px] border-rng-info text-rng-info bg-transparent hover:bg-[color-mix(in_srgb,var(--rng-info)_15%,transparent)]",
        ghost: "bg-transparent text-rng-text-body hover:bg-rng-bg-elevated",
        dns: "border-[1.5px] border-rng-action text-rng-action bg-transparent hover:bg-[color-mix(in_srgb,var(--rng-action)_15%,transparent)]",
      },
    },
    defaultVariants: { variant: "action" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
