import * as React from "react"
import { cn } from "cn"
import { Select as SelectPrimitive } from "radix-ui"
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react"

function Select({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />
}

function SelectGroup({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("scroll-my-1 p-1", className)}
      {...props}
    />
  )
}

function SelectValue({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: "sm" | "default"
}) {
  return (
    <SelectPrimitive.Trigger
      // Un disparador nunca envía el formulario que lo contiene: dentro de un
      // <form>, el submit cerraba la lista en el mismo clic que la abría.
      type="button"
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        // Personalizado a EzLLM: densidad de escritorio, superficie elevada
        // (base-850) y borde visible. Los roles genéricos de shadcn
        // (bg-popover, border-input) se sustituyen por los tokens de la app.
        "flex w-fit items-center justify-between gap-1.5 rounded-control border border-base-700 bg-base-850 py-1.5 pr-2 pl-2.5 text-label text-ink-200 whitespace-nowrap transition-colors outline-none select-none hover:bg-base-800 focus-visible:border-accent-400 disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-ink-500 data-[state=open]:rounded-b-none data-[state=open]:border-b-transparent data-[state=open]:bg-base-900 data-[state=open]:hover:bg-base-900 data-[size=default]:h-9 data-[size=sm]:h-7 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:text-ink-400 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  position = "item-aligned",
  align = "center",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        data-align-trigger={position === "item-aligned"}
        className={cn("relative z-50 max-h-[min(18rem,var(--radix-select-content-available-height))] min-w-36 overflow-x-hidden overflow-y-auto rounded-panel border border-base-700 bg-base-900 p-1 text-ink-200 shadow-float data-[side=bottom]:rounded-t-none data-[side=bottom]:border-t-0 data-[side=top]:rounded-b-none data-[side=top]:border-b-0", position ==="popper"&&"", className )}
        position={position}
        align={align}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          data-position={position}
          className={cn(
            "data-[position=popper]:h-(--radix-select-trigger-height) data-[position=popper]:w-full data-[position=popper]:min-w-(--radix-select-trigger-width)",
            position === "popper" && ""
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn("px-2 py-1.5 text-micro font-medium tracking-wide text-ink-500 uppercase", className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        // Fila de lista: 12px, radio 5px como el resto de filas de la app y
        // el acento solo en la opción elegida. `data-highlighted` es el
        // estado real de radix al pasar el ratón o navegar con teclado.
        "relative flex w-full cursor-pointer items-center gap-1.5 rounded-[5px] py-1.5 pr-2 pl-2 text-label text-ink-300 outline-hidden select-none data-[highlighted]:rounded-none data-[highlighted]:bg-base-850 data-[highlighted]:text-ink-100 data-[state=checked]:rounded-none data-[state=checked]:bg-accent-500/15 data-[state=checked]:text-accent-300 data-[highlighted]:data-[state=checked]:bg-accent-500/25 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="flex-1">{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn(
        "z-10 flex cursor-default items-center justify-center bg-base-900 py-1 text-ink-400 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronUpIcon
      />
    </SelectPrimitive.ScrollUpButton>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn(
        "z-10 flex cursor-default items-center justify-center bg-base-900 py-1 text-ink-400 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronDownIcon
      />
    </SelectPrimitive.ScrollDownButton>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
