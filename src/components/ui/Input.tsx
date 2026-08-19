import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string }>(
  ({ label, error, className = "", id, ...props }, ref) => {
    return (
      <label className="block">
        {label && <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>}
        <input
          ref={ref}
          id={id}
          className={`w-full rounded-sm border bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft/60 focus:ring-1 focus:ring-bronze-400 ${
            error ? "border-rust" : "border-line"
          } ${className}`}
          {...props}
        />
        {error && <span className="mt-1 block text-xs text-rust">{error}</span>}
      </label>
    );
  }
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string }>(
  ({ label, error, className = "", id, ...props }, ref) => {
    return (
      <label className="block">
        {label && <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>}
        <textarea
          ref={ref}
          id={id}
          className={`w-full rounded-sm border bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft/60 focus:ring-1 focus:ring-bronze-400 ${
            error ? "border-rust" : "border-line"
          } ${className}`}
          {...props}
        />
        {error && <span className="mt-1 block text-xs text-rust">{error}</span>}
      </label>
    );
  }
);
Textarea.displayName = "Textarea";
