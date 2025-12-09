"use client";
import React from "react";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center text-center px-4 relative">
      {/* 🌟 Hero Text */}
      <h1 className="hero-title mt-20">Predict the Future with Confidence</h1>
      <p className="hero-subtitle mb-10">
        Join the World’s Prediction Revolution — Powered by BlockDAG
      </p>

      {/* 📊 Featured Markets */}
      <section className="z-10 mt-10 w-full max-w-6xl flex flex-col gap-10">
        {/* 🟩 Top Row — 2 turquoise boxes side-by-side */}
        <div className="flex flex-wrap justify-center gap-8 sm:gap-12 md:gap-16 lg:gap-20 px-6">
          <div className="market-box turquoise w-full sm:basis-[300px] sm:max-w-[300px] mx-4">
            <p>
              Will BlockDAG hit $1 by{" "}
              <span className="date-text">Aug 2026?</span>
            </p>
            <a href="/markets" className="btn-glow mt-4 inline-block">View Market</a>
          </div>
          <div className="market-box turquoise w-full sm:basis-[300px] sm:max-w-[300px] mx-4">
            <p>
              Will Alexander win MVP in{" "}
              <span className="date-text">2026?</span>
            </p>
            <a href="/markets" className="btn-glow mt-4 inline-block">View Market</a>
          </div>
        </div>

        {/* ⚪ Bottom Row — 1 white box centered */}
        <div className="flex justify-center">
          <div className="market-box white w-full sm:max-w-[300px] mx-4">
            <p>Will Dubai have hottest summer ever?</p>
            <a href="/markets" className="btn-glow mt-4 inline-block">View Market</a>
          </div>
        </div>
      </section>

      {/* 🚀 Action Buttons */}
      <div className="mt-64 flex flex-wrap justify-center gap-6">
        <a href="/markets" className="btn-glow">Start Predicting</a>
      </div>
    </main>
  );
}
