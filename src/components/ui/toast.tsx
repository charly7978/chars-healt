
import * as React from "react"
import * as ToastPrimitives from "@radix-ui/react-toast"
import { cn } from "../../lib/utils"

export interface ToastProps extends React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}

export const Toast = React.forwardRef<React.ElementRef<typeof ToastPrimitives.Root>, ToastProps>(
  ({ className, ...props }, ref) => {
    return (
      <ToastPrimitives.Root
        ref={ref}
        className={cn("group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-6 pr-8 shadow-lg transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full", 
          className
        )}
        {...props}
      />
    )
  }
)
Toast.displayName = ToastPrimitives.Root.displayName;

export const ToastClose = React.forwardRef<React.ElementRef<typeof ToastPrimitives.Close>, React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>>(
  ({ className, ...props }, ref) => (
    <ToastPrimitives.Close ref={ref} className={cn("absolute right-2 top-2 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100", className)} {...props} />
  )
);
ToastClose.displayName = ToastPrimitives.Close.displayName;

export const ToastTitle = React.forwardRef<React.ElementRef<typeof ToastPrimitives.Title>, React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>>(
  ({ className, ...props }, ref) => (
    <ToastPrimitives.Title ref={ref} className={cn("text-sm font-semibold", className)} {...props} />
  )
);
ToastTitle.displayName = ToastPrimitives.Title.displayName;

export const ToastDescription = React.forwardRef<React.ElementRef<typeof ToastPrimitives.Description>, React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>>(
  ({ className, ...props }, ref) => (
    <ToastPrimitives.Description ref={ref} className={cn("text-sm opacity-90", className)} {...props} />
  )
);
ToastDescription.displayName = ToastPrimitives.Description.displayName;

export type ToastActionElement = React.ReactElement<typeof ToastPrimitives.Action>

export const ToastProvider = ToastPrimitives.Provider;
export const ToastViewport = ToastPrimitives.Viewport;
