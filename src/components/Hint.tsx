import type { ReactElement } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "./ui-kit/tooltip";

/** Explicación de un control sin texto visible: aparece al pasar o enfocar. */
export default function Hint({
  label,
  children,
}: {
  label: string;
  children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
