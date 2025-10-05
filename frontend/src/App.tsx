import React, { useState, useEffect } from "react";
import DeviceCard from "./components/DeviceCard";

interface Device {
  id: number;
  name: string;
  readings: number[];
}

const App: React.FC = () => {
  const [devices, setDevices] = useState<Device[]>([
    { id: 1, name: "Heart Rate Sensor", readings: [] },
    { id: 2, name: "Temperature Sensor", readings: [] },
  ]);

  // Simulate live data updates every second
  useEffect(() => {
    const interval = setInterval(() => {
      setDevices(prev =>
        prev.map(device => ({
          ...device,
          readings: [...device.readings.slice(-9), Math.floor(Math.random() * 100)]
        }))
      );
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app">
      <h1>Health IoT Dashboard</h1>
      <div className="cards-container">
        {devices.map(device => (
          <DeviceCard key={device.id} device={device} />
        ))}
      </div>
    </div>
  );
};

export default App;
