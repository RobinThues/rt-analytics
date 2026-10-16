"use client";
import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

/** Submit button that is disabled while its form's server action runs, so a double click saves once. */
export function SubmitButton({
  pendingLabel,
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, "type" | "disabled"> & { pendingLabel: string; children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
