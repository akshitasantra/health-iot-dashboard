export interface Device {
  id: number;
  name: string;
  status: string;
}

export interface HealthData {
  heartRate: number;
  temperature: number;
  oxygenLevel: number;
}

const API_URL = "http://127.0.0.1:5000";

export const fetchDevices = async (): Promise<Device[]> => {
  const res = await fetch(`${API_URL}/devices`);
  return res.json();
};

export const fetchHealthData = async (): Promise<HealthData> => {
  const res = await fetch(`${API_URL}/health`);
  return res.json();
};
