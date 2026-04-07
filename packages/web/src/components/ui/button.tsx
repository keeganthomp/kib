import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
	"inline-flex items-center justify-center gap-1.5 rounded-md text-[13px] font-medium transition-all duration-150 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
	{
		variants: {
			variant: {
				default: "bg-foreground text-background hover:opacity-85 active:scale-[0.97]",
				outline: "border border-border text-foreground hover:bg-card active:scale-[0.97]",
			},
			size: {
				default: "h-8 px-3.5",
				sm: "h-7 px-2.5 text-xs",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

interface ButtonProps
	extends ButtonHTMLAttributes<HTMLButtonElement>,
		VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
	return <button className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
