import { useEffect, useState } from "react";
import { Line } from "react-chartjs-2";
import Chart from "chart.js/auto";

interface Device {
  id: number;
  name: string;
  readings: number[];
}

export default function App() {
  const [devices, setDevices] = useState<Device[]>([]);

  useEffect(() => {
    fetch("http://127.0.0.1:8000/devices")
      .then((res) => res.json())
      .then((data) => {
        console.log("Fetched devices:", data);
        setDevices(data);
      });
  }, []);

  return (
    <div style={{ padding: "20px" }}>
      <h1>Health IoT Dashboard</h1>
      {devices.map((device) => (
        <div key={device.id} style={{ border: "1px solid #ccc", margin: "10px", padding: "10px" }}>
          <h2>{device.name}</h2>
          {device.readings?.length ? (
            <Line
              data={{
                labels: device.readings.map((_, i) => `T${i}`),
                datasets: [
                  {
                    label: device.name,
                    data: device.readings,
                    borderColor: "blue",
                    backgroundColor: "rgba(0,0,255,0.1)",
                  },
                ],
              }}
            />
          ) : (
            <p>No data available</p>
          )}
        </div>
      ))}
    </div>
  );
}
