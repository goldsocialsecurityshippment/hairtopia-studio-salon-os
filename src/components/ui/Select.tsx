import { SelectHTMLAttributes, forwardRef } from "react";

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { label?: string; error?: string }
>(({ label, error, className = "", id, children, ...props }, ref) => {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>}
      <select
        ref={ref}
        id={id}
        className={`w-full rounded-sm border bg-surface px-3.5 py-2.5 text-sm text-ink focus:ring-1 focus:ring-bronze-400 ${
          error ? "border-rust" : "border-line"
        } ${className}`}
        {...props}
      >
        {children}
      </select>
      {error && <span className="mt-1 block text-xs text-rust">{error}</span>}
    </label>
  );
});
Select.displayName = "Select";
