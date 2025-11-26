import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/shared/utils/cn"
import { X } from "lucide-react"

interface DialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

const Dialog = ({ open, onOpenChange, children }: DialogProps) => {
  return (
    <DialogContext.Provider value={{ open: open || false, onOpenChange }}>
      {children}
    </DialogContext.Provider>
  )
}

const DialogContext = React.createContext<{
  open: boolean
  onOpenChange?: (open: boolean) => void
}>({ open: false })

const DialogTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ onClick, ...props }, ref) => {
  const { onOpenChange } = React.useContext(DialogContext)
  return (
    <button
      ref={ref}
      onClick={(e) => {
        onClick?.(e)
        onOpenChange?.(true)
      }}
      {...props}
    />
  )
})
DialogTrigger.displayName = "DialogTrigger"

const DialogPortal = ({ children }: { children: React.ReactNode }) => {
  const { open } = React.useContext(DialogContext)
  if (!open) return null
  return createPortal(children, document.body)
}

const DialogOverlay = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const { onOpenChange } = React.useContext(DialogContext)
  return (
    <div
      ref={ref}
      className={cn(
        "fixed inset-0 z-50 bg-black/80",
        className
      )}
      onClick={() => onOpenChange?.(false)}
      {...props}
    />
  )
})
DialogOverlay.displayName = "DialogOverlay"

const dialogSizeClasses: Record<string, string> = {
  sm: "sm:max-w-[420px]",
  md: "sm:max-w-[540px]",
  lg: "sm:max-w-[720px]",
  xl: "sm:max-w-4xl",
  full: "sm:max-w-[min(90vw,1100px)]",
}

type DialogContentProps = React.HTMLAttributes<HTMLDivElement> & {
  position?: 'center' | 'bottom'
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
}

const DialogContent = React.forwardRef<
  HTMLDivElement,
  DialogContentProps
>(({ className, children, position = 'center', size = 'lg', ...props }, ref) => {
  const { onOpenChange } = React.useContext(DialogContext)
  return (
    <DialogPortal>
      <DialogOverlay />
      <div
        className={cn(
          "fixed inset-0 z-50 flex p-4 sm:p-6",
          position === 'bottom'
            ? 'items-end justify-center'
            : 'items-center justify-center'
        )}
        onClick={() => onOpenChange?.(false)}
      >
        <div
          ref={ref}
          className={cn(
            "relative grid w-full gap-0 bg-background border rounded-lg shadow-lg px-0 py-0 overflow-hidden",
            dialogSizeClasses[size],
            position === 'bottom' && 'pointer-events-auto max-w-4xl translate-y-0 rounded-t-lg rounded-b-md pb-[calc(env(safe-area-inset-bottom)+1.5rem)]',
            className
          )}
          onClick={(e) => e.stopPropagation()}
          {...props}
        >
          {children}
          <button
            onClick={() => onOpenChange?.(false)}
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>
      </div>
    </DialogPortal>
  )
})
DialogContent.displayName = "DialogContent"

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col gap-1.5 text-center sm:text-left p-6",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = "DialogTitle"

const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = "DialogDescription"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-wrap gap-3 justify-end p-6",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogBody = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "p-6",
      className
    )}
    {...props}
  />
)
DialogBody.displayName = "DialogBody"

export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogBody,
}