import React from "react";

type ButtonProps = {
  children: React.ReactNode;
  variant?: "primary" | "create";
};

export default function Button({ children, variant = "primary" }: ButtonProps) {
  const base = "px-6 py-2 rounded-lg font-semibold border-2 transition-all duration-300";

  const styles = {
    primary:
      "border-[#FF6F33] text-white shadow-[0_0_25px_8px_rgba(255,255,255,0.7),_0_0_45px_14px_rgba(255,255,255,0.5)] hover:scale-105",
    create:
      "border-[#FF3C00] text-[#FF3C00] shadow-[0_0_25px_8px_rgba(255,60,0,0.8),_0_0_50px_15px_rgba(255,60,0,0.6)] hover:scale-105",
  } as const;

  return <button className={`${base} ${styles[variant]}`}>{children}</button>;
}
