import React, { useEffect, useState } from "react";
import { fetchHealthData, HealthData } from "../api/backend";

const HealthSummary: React.FC = () => {
  const [health, setHealth] = useState<HealthData | null>(null);

  useEffect(() => {
    fetchHealthData().then(setHealth);
  }, []);

  if (!health) return <p>Loading...</p>;

  return (
    <div>
      <h2>Patient Health Summary</h2>
      <ul>
        <li>Heart Rate: {health.heartRate} bpm</li>
        <li>Temperature: {health.temperature} °C</li>
        <li>Oxygen Level: {health.oxygenLevel} %</li>
      </ul>
    </div>
  );
};

export default HealthSummary;
