import * as React from "react"

import { useMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface SidebarProps {
  // Add your props here
}

export function Sidebar({ /* add props here */ }: SidebarProps) {
  const isMobile = useMobile()
  const [isResizing, setIsResizing] = React.useState(false)
  const [width, setWidth] = React.useState(280)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const savedWidth = localStorage.getItem("sidebar-width")
    if (savedWidth) {
      setWidth(parseInt(savedWidth))
    }
  }, [])

  React.useEffect(() => {
    localStorage.setItem("sidebar-width", width.toString())
  }, [width])

  const handleResize = React.useCallback(
    (event: MouseEvent) => {
      if (!isResizing || !ref.current) return

      const containerWidth = ref.current.parentElement?.offsetWidth
      if (!containerWidth) return

      const newWidth = event.clientX - ref.current.offsetLeft
      if (newWidth > 200 && newWidth < containerWidth - 100) {
        setWidth(newWidth)
      }
    },
    [isResizing, ref]
  )

  React.useEffect(() => {
    document.addEventListener("mousemove", handleResize)
    document.addEventListener("mouseup", () => setIsResizing(false))
    return () => {
      document.removeEventListener("mousemove", handleResize)
      document.removeEventListener("mouseup", () => setIsResizing(false))
    }
  }, [handleResize])

  const handleDrag = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsResizing(true)
  }

  if (isMobile) {
    return (
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Open sidebar">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
            >
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-full sm:max-w-sm">
          <div className="flex flex-col space-y-4 p-4">
            <Input placeholder="Search..." type="search" />
            <Separator />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <div className="hidden border-r bg-gray-100 lg:block">
      <div
        ref={ref}
        style={{ width: width }}
        className="group relative flex h-screen flex-col overflow-y-auto border-r bg-background"
      >
        <div className="px-6 py-4">
          <Input placeholder="Search..." type="search" />
        </div>
        <Separator />
        <div className="flex-1">
          <div className="flex flex-col space-y-1 px-2 py-4">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" className="justify-start px-3.5">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mr-2 h-4 w-4"
                    >
                      <path d="m3 9 4.5-4.5a5 5 0 1 1 7 7L21 15" />
                      <path d="m21 9-4.5 4.5a5 5 0 1 1-7-7L3 15" />
                    </svg>
                    <span>Overview</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Analytics and insights</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" className="justify-start px-3.5">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mr-2 h-4 w-4"
                    >
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <line x1="22" y1="11" x2="22" y2="5" />
                      <path d="M22 10V5a2 2 0 0 0-2-2H2" />
                    </svg>
                    <span>Customers</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Your customers</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" className="justify-start px-3.5">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mr-2 h-4 w-4"
                    >
                      <rect width="20" height="14" x="2" y="5" rx="2" />
                      <line x1="2" y1="10" x2="22" y2="10" />
                    </svg>
                    <span>Invoices</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Your invoices</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" className="justify-start px-3.5">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mr-2 h-4 w-4"
                    >
                      <path d="M12 2v20" />
                      <path d="M17 5h-4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" />
                      <path d="M7 5h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7" />
                    </svg>
                    <span>Reports</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Advanced reporting</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" className="justify-start px-3.5">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mr-2 h-4 w-4"
                    >
                      <path d="M19 5v14H5V5m0 0l7 7L19 5m-7 0v7" />
                    </svg>
                    <span>Export</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Export data</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" className="justify-start px-3.5">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mr-2 h-4 w-4"
                    >
                      <path d="M14.7 6.3a1 1 0 0 0-1.4 0l-4 4a1 1 0 0 0 1.4 1.4l4-4a1 1 0 0 0 0-1.4z" />
                      <path d="M9.3 6.3a1 1 0 0 1 1.4 0l4 4a1 1 0 0 1-1.4 1.4l-4-4a1 1 0 0 1 0-1.4z" />
                      <line x1="2" y1="17" x2="22" y2="17" />
                    </svg>
                    <span>Integrations</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Connect to other apps</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" className="justify-start px-3.5">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mr-2 h-4 w-4"
                    >
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19 12c-1.66 0-3 1.51-3 3.4 0 1.4 2.97 3.6 3 3.6s3-2.2 3-3.6c0-1.88-1.34-3.4-3-3.4z" />
                      <path d="M5 12c1.66 0 3 1.51 3 3.4 0 1.4-2.97 3.6-3 3.6S2 16.8 2 15.4c0-1.88 1.34-3.4 3-3.4z" />
                    </svg>
                    <span>More</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Explore more features</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        <Separator />
        <div className="absolute bottom-0 flex items-center w-full border-t">
          <div
            onMouseDown={handleDrag}
            className="absolute inset-y-0 right-0 flex cursor-ew-resize items-center justify-center opacity-0 group-hover:opacity-100"
          >
            <div className="h-10 w-1 bg-gray-200 hover:bg-gray-300" />
          </div>
          <Button variant="ghost" className="w-full rounded-none">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mr-2 h-4 w-4"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Chat
          </Button>
        </div>
      </div>
    </div>
  )
}
