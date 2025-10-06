import { useEffect, useState } from "react";

interface Device {
  id: number;
  name: string;
  temperature: number;
  heart_rate: number;
  battery: number;
  status: string;
}

export default function DevicePanel() {
  const [devices, setDevices] = useState<Device[]>([]);

  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8000/ws/devices");
    ws.onmessage = (event) => {
      const updated = JSON.parse(event.data);
      setDevices(updated);
    };
    return () => ws.close();
  }, []);

  const statusColors: Record<string, string> = {
    normal: "border-green-500 bg-green-50",
    warning: "border-yellow-500 bg-yellow-50",
    critical: "border-red-500 bg-red-50",
  };

  return (
    <div className="p-4 w-80 bg-gray-50 h-screen overflow-y-auto border-r">
      <h2 className="text-xl font-semibold mb-4">Devices</h2>
      <div className="flex flex-col gap-4">
        {devices.map((device) => (
          <div
            key={device.id}
            className={`p-4 rounded-2xl shadow-sm border-2 transition-all ${statusColors[device.status]}`}
          >
            <h3 className="text-lg font-bold">{device.name}</h3>
            <div className="text-sm mt-2">
              <p>🌡️ Temp: {device.temperature.toFixed(1)} °F</p>
              <p>💓 Heart Rate: {device.heart_rate} BPM</p>
              <p>🔋 Battery: {device.battery.toFixed(1)}%</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
