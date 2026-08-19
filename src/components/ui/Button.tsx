import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variantClasses: Record<Variant, string> = {
  primary: "bg-ink text-canvas hover:bg-bronze-600 disabled:bg-ink-soft",
  secondary: "bg-transparent text-ink border border-ink/20 hover:border-ink/50",
  ghost: "bg-transparent text-ink-soft hover:text-ink hover:bg-bronze-50",
  danger: "bg-rust text-white hover:bg-rust/90",
};

const sizeClasses: Record<Size, string> = {
  sm: "text-sm px-3 py-1.5",
  md: "text-sm px-4 py-2.5",
  lg: "text-base px-6 py-3.5",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }
>(({ variant = "primary", size = "md", loading, className = "", children, disabled, ...props }, ref) => {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-sm font-body font-medium tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {loading && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
});
Button.displayName = "Button";
