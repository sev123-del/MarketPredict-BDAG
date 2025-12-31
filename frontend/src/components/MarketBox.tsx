"use client";
import React from "react";

interface MarketBoxProps {
  question: string;
  variant?: "turquoise" | "white";
}

export default function MarketBox({ question, variant = "turquoise" }: MarketBoxProps) {
  return (
    <div className={`market-box ${variant}`}>
      <p className="text-lg text-[color:var(--mp-fg)] leading-snug mb-4">{question}</p>
      <button className="btn-glow">View Market</button>
    </div>
  );
}
