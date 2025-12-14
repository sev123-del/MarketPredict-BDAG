"use client";
import React, { useState } from "react";

export default function CreateMarketForm({ onCreate }) {
  const [category, setCategory] = useState("");
  const [asset, setAsset] = useState("");
  const [comparator, setComparator] = useState("");
  const [value, setValue] = useState("");
  const [date, setDate] = useState("");
  const [question, setQuestion] = useState("");

  const cryptoAssets = ["BDAG", "Bitcoin", "Ethereum"];
  const comparators = ["greater than", "greater than or equal to", "less than", "less than or equal to"];

  const handleGenerateQuestion = () => {
    if (!category || !asset || !comparator || !value || !date) {
      alert("Please complete all fields");
      return;
    }
    const q = `Will ${asset} be ${comparator} $${value} by ${date}?`;
    setQuestion(q);
  };

  const handleCreate = () => {
    if (!question) return alert("Generate question first");
    onCreate(question);
  };

  return (
    <div style={{ marginTop: "1.5rem", padding: "1rem", border: "1px solid #ccc", borderRadius: "12px" }}>
      <h2>Create Custom Market</h2>

      <div style={{ marginBottom: "0.8rem" }}>
        <label>Category: </label>
        <select name="category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Select category</option>
          <option value="crypto">Crypto</option>
          <option value="weather">Weather (soon)</option>
          <option value="sports">Sports (Play Money only)</option>
        </select>
      </div>

      {category === "crypto" && (
        <>
          <div style={{ marginBottom: "0.8rem" }}>
            <label>Asset: </label>
            <select name="asset" value={asset} onChange={(e) => setAsset(e.target.value)}>
              <option value="">Select crypto</option>
              {cryptoAssets.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: "0.8rem" }}>
            <label>Comparator: </label>
            <select name="comparator" value={comparator} onChange={(e) => setComparator(e.target.value)}>
              <option value="">Select comparator</option>
              {comparators.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: "0.8rem" }}>
            <label>Value (USD): </label>
            <input name="value" type="number" step="0.0001" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>

          <div style={{ marginBottom: "0.8rem" }}>
            <label>Target Date: </label>
            <input name="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <button onClick={handleGenerateQuestion} style={{ marginRight: "0.5rem" }}>
            Preview Question
          </button>
          <button onClick={handleCreate}>Create Market</button>

          {question && (
            <p style={{ marginTop: "1rem", fontWeight: "bold", color: "#4ade80" }}>{question}</p>
          )}
        </>
      )}
    </div>
  );
}
