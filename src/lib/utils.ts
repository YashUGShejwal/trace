import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function friendlyError(message?: string) {
  const msg = (message || "").toLowerCase();

  if (msg.includes("row-level security") || msg.includes("rls") || msg.includes("permission denied") || msg.includes("403")) {
    return "You don't have permission to do that. Ask a project owner to give you access.";
  }

  if (msg.includes("duplicate key") || msg.includes("already exists")) {
    return "This item already exists.";
  }

  if (msg.includes("jwt") && msg.includes("expired")) {
    return "Your session expired. Please sign in again.";
  }

  if (msg.includes("invalid input") || msg.includes("syntax error") || msg.includes("payload")) {
    return "Some details look invalid. Please check and try again.";
  }

  if (msg.includes("foreign key") || msg.includes("violates foreign key")) {
    return "Linked data is missing. Please refresh and try again.";
  }

  return message || "Something went wrong. Please try again.";
}
