import React, { useEffect, useState } from "react";
import { fetchDevices, Device } from "../api/backend";
import DeviceCard from "./DeviceCard";

const DeviceList: React.FC = () => {
  const [devices, setDevices] = useState<Device[]>([]);

  useEffect(() => {
    fetchDevices().then(setDevices);
  }, []);

  return (
    <div>
      <h2>Connected Devices</h2>
      {devices.map((device) => (
        <DeviceCard key={device.id} device={device} />
      ))}
    </div>
  );
};

export default DeviceList;
