"use client";

import { useState } from "react";

export function ProfileForm(props: {
  initialMeasurementPref: "UK" | "US" | "METRIC";
  initialKeepSmallVolumeUnits: boolean;
  initialForceMetricMass: boolean;
}) {
  const [measurementPref, setMeasurementPref] = useState(props.initialMeasurementPref);
  const [keepSmallVolumeUnits, setKeepSmallVolumeUnits] = useState(props.initialKeepSmallVolumeUnits);
  const [forceMetricMass, setForceMetricMass] = useState(props.initialForceMetricMass);
  const [status, setStatus] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Saving...");

    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        measurementPref,
        conversionPrefs: {
          keepSmallVolumeUnits,
          forceMetricMass,
        },
      }),
    });

    if (!response.ok) {
      setStatus("Save failed");
      return;
    }

    setStatus("Saved");
  }

  return (
    <form onSubmit={onSubmit} className="card" style={{ maxWidth: 560 }}>
      <h3>Measurement Settings</h3>

      <label>
        Default display system
        <select value={measurementPref} onChange={(e) => setMeasurementPref(e.target.value as "UK" | "US" | "METRIC")}> 
          <option value="UK">UK</option>
          <option value="US">US</option>
          <option value="METRIC">Metric</option>
        </select>
      </label>

      <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <input
          type="checkbox"
          checked={keepSmallVolumeUnits}
          onChange={(e) => setKeepSmallVolumeUnits(e.target.checked)}
        />
        Keep small volume amounts as tsp/tbsp when possible
      </label>

      <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <input
          type="checkbox"
          checked={forceMetricMass}
          onChange={(e) => setForceMetricMass(e.target.checked)}
        />
        Force mass display to g/kg (e.g. lbs to g)
      </label>

      <button type="submit">Save Preferences</button>
      {status ? <p className="muted">{status}</p> : null}
    </form>
  );
}
