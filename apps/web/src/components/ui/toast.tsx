"use client";

import * as React from "react";
import * as ToastPrimitives from "@radix-ui/react-toast";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const ToastProvider = ToastPrimitives.Provider;

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      "fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]",
      className,
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitives.Viewport.displayName;

// § 5.10 — fix shadcn focus-ring contrast gap on close-action affordances.
const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-center justify-between space-x-2 overflow-hidden rounded-md border p-4 pr-6 shadow-lg transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full",
  {
    variants: {
      variant: {
        default:
          "border-[color:var(--color-border)] bg-[color:var(--color-background)] text-[color:var(--color-foreground)]",
        destructive:
          "destructive group border-[color:var(--color-destructive)] bg-[color:var(--color-destructive)] text-[color:var(--color-destructive-foreground)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

// § 5.10 SR-pattern #3: destructive variant escalates to role="alert"
// + aria-live="assertive". Default toasts stay polite (role="status",
// aria-live="polite") so they don't interrupt screen-reader flow.
const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> &
    VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
  const isDestructive = variant === "destructive";
  return (
    <ToastPrimitives.Root
      ref={ref}
      className={cn(toastVariants({ variant }), className)}
      // Radix' default is role="status" + aria-live="polite". For the
      // destructive variant we explicitly override to alert/assertive —
      // these props pass through to the underlying <li> element.
      role={isDestructive ? "alert" : "status"}
      aria-live={isDestructive ? "assertive" : "polite"}
      {...props}
    />
  );
});
Toast.displayName = ToastPrimitives.Root.displayName;

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      "inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-[color:var(--color-border)] bg-transparent px-3 text-sm font-medium transition-colors hover:bg-[color:var(--color-secondary)]",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-background)]",
      "disabled:pointer-events-none disabled:opacity-50",
      "group-[.destructive]:border-[color:var(--color-destructive-foreground)]/40 group-[.destructive]:hover:border-[color:var(--color-destructive-foreground)]/30 group-[.destructive]:hover:bg-[color:var(--color-destructive)] group-[.destructive]:hover:text-[color:var(--color-destructive-foreground)] group-[.destructive]:focus-visible:ring-[color:var(--color-destructive-foreground)]",
      className,
    )}
    {...props}
  />
));
ToastAction.displayName = ToastPrimitives.Action.displayName;

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      "absolute right-1 top-1 rounded-md p-1 text-[color:var(--color-foreground)]/60 opacity-0 transition-opacity hover:text-[color:var(--color-foreground)] focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-background)] group-hover:opacity-100",
      "group-[.destructive]:text-[color:var(--color-destructive-foreground)]/80 group-[.destructive]:hover:text-[color:var(--color-destructive-foreground)] group-[.destructive]:focus:ring-[color:var(--color-destructive-foreground)]",
      className,
    )}
    aria-label="Schließen"
    toast-close=""
    {...props}
  >
    <X className="h-4 w-4" />
  </ToastPrimitives.Close>
));
ToastClose.displayName = ToastPrimitives.Close.displayName;

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn("text-sm font-semibold", className)}
    {...props}
  />
));
ToastTitle.displayName = ToastPrimitives.Title.displayName;

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn("text-sm opacity-90", className)}
    {...props}
  />
));
ToastDescription.displayName = ToastPrimitives.Description.displayName;

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>;

type ToastActionElement = React.ReactElement<typeof ToastAction>;

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
};
