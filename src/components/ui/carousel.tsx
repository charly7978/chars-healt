import * as React from "react"
import { ArrowLeftIcon, ArrowRightIcon } from "@radix-ui/react-icons"
import { cn } from "../../lib/utils"
import { buttonVariants } from "../ui/button"

interface CarouselProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  className?: string
}

const Carousel = React.forwardRef<HTMLDivElement, CarouselProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn("relative", className)} {...props}>
        {children}
      </div>
    )
  }
)
Carousel.displayName = "Carousel"

interface CarouselContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  className?: string
}

const CarouselContent = React.forwardRef<HTMLDivElement, CarouselContentProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "relative flex overflow-hidden scroll-smooth snap-x snap-mandatory",
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)
CarouselContent.displayName = "CarouselContent"

interface CarouselItemProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  className?: string
}

const CarouselItem = React.forwardRef<HTMLDivElement, CarouselItemProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("relative w-full shrink-0 snap-start", className)}
        {...props}
      >
        {children}
      </div>
    )
  }
)
CarouselItem.displayName = "CarouselItem"

interface CarouselPreviousProps
  extends React.HTMLAttributes<HTMLButtonElement> {
  className?: string
}

const CarouselPrevious = React.forwardRef<
  HTMLButtonElement,
  CarouselPreviousProps
>(({ className, ...props }, ref) => {
  return (
    <button
      ref={ref}
      className={cn(
        buttonVariants({ variant: "ghost", size: "icon" }),
        "absolute left-0 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full",
        className
      )}
      {...props}
    >
      <ArrowLeftIcon className="h-4 w-4" />
      <span className="sr-only">Previous</span>
    </button>
  )
})
CarouselPrevious.displayName = "CarouselPrevious"

interface CarouselNextProps extends React.HTMLAttributes<HTMLButtonElement> {
  className?: string
}

const CarouselNext = React.forwardRef<HTMLButtonElement, CarouselNextProps>(
  ({ className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "absolute right-0 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full",
          className
        )}
        {...props}
      >
        <ArrowRightIcon className="h-4 w-4" />
        <span className="sr-only">Next</span>
      </button>
    )
  }
)
CarouselNext.displayName = "CarouselNext"

export {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
}
