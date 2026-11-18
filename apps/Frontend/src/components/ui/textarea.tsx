import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";
import { FIELD_BASE } from "./input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(FIELD_BASE, "resize-none px-3.5 py-2.5", className)} {...props} />
));
Textarea.displayName = "Textarea";
