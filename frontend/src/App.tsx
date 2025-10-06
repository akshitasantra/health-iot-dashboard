import React, { useEffect, useRef, useState } from "react";
import { Line } from "react-chartjs-2";
import Chart from "chart.js/auto";

type Reading = { time: string; value: number };

type Device = {
  id?: number;
  name: string;
  temperature?: number;
  heartRate?: number;
  battery: number;
  alertLevel?: "green" | "yellow" | "red";
  readings: Reading[];
};

type Patient = {
  id: number;
  name: string;
  devices: Device[];
};

const MAX_POINTS = 50;
const REDRAW_MS = 50; // redraw loop interval

export default function App(): JSX.Element {
  const [patients, setPatients] = useState<Patient[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const chartRefs = useRef<Chart[]>([]);

  // helper: dedupe devices by name (keeps last occurrence)
  const dedupeDevices = (devices: Device[]): Device[] => {
    const map = new Map<string, Device>();
    for (const d of devices) {
      map.set(d.name, d);
    }
    return Array.from(map.values());
  };

  // normalize battery to 0..100 (accepts either 0..1 or 0..100)
  const normalizeBattery = (raw: number | undefined): number => {
    if (raw === undefined || raw === null) return 0;
    if (raw <= 1) return Math.round(raw * 100);
    return Math.round(raw);
  };

  // patient-level battery: worst (minimum) device battery, expressed 0..100
  const patientBatteryPercent = (devices: Device[]): number => {
    if (!devices || devices.length === 0) return 0;
    const values = devices.map((d) => normalizeBattery(d.battery));
    return Math.min(...values);
  };

  // pick color from battery percentage
  const batteryColorFromPercent = (pct: number): string => {
    if (pct < 40) return "#ef4444";    // red
    if (pct < 75) return "#eab308";    // yellow
    return "#16a34a";                  // green
  };


  // connect to WS and update state; convert readings to desired shape
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8000/ws/patients");
    wsRef.current = ws;

    ws.onopen = () => console.info("WS open -> /ws/patients");
    ws.onerror = (e) => console.warn("WS error", e);
    ws.onclose = () => console.info("WS closed");

    ws.onmessage = (ev) => {
      try {
        const incoming: any[] = JSON.parse(ev.data);
        const mapped: Patient[] = incoming.map((p) => {
          const devices: Device[] = dedupeDevices(
            (p.devices ?? []).map((d: any) => {
              // Normalize readings: if backend sends numeric timestamps, convert to human string
              const readings: Reading[] =
                (d.readings ?? []).map((r: any) => {
                  if (r.time && typeof r.time === "number") {
                    // assume epoch seconds or loop time; convert to local time string
                    return { time: new Date(r.time * 1000).toLocaleTimeString(), value: r.value };
                  }
                  // assume string
                  return { time: r.time ?? new Date().toLocaleTimeString(), value: r.value ?? 0 };
                }) ?? [];

              // enforce MAX_POINTS and last N
              const clipped = readings.slice(-MAX_POINTS);

              return {
                id: d.id,
                name: d.name,
                temperature: d.temperature,
                heartRate: d.heartRate,
                battery: d.battery ?? 0,
                alertLevel: d.alertLevel ?? "green",
                readings: clipped,
              } as Device;
            })
          );

          return {
            id: p.id,
            name: p.name,
            devices,
          } as Patient;
        });

        setPatients(mapped);
      } catch (e) {
        console.error("Failed to parse WS message", e);
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, []);

  // Smooth redraw loop to update Chart.js instances without animation jump
  useEffect(() => {
    let rafId: number | null = null;
    const tick = () => {
      chartRefs.current.forEach((c) => {
        try {
          if (c && (c as any).update) (c as any).update("none");
        } catch (e) {
          // ignore
        }
      });
      rafId = window.setTimeout(() => requestAnimationFrame(tick), REDRAW_MS) as unknown as number;
    };
    requestAnimationFrame(tick);
    return () => {
      if (rafId) {
        clearTimeout(rafId);
      }
    };
  }, []);

  // Determine patient-level alert (worst among devices)
  const patientAlert = (devices: Device[]) => {
    if (devices.some((d) => d.alertLevel === "red")) return "red";
    if (devices.some((d) => d.alertLevel === "yellow")) return "yellow";
    return "green";
  };

  // Inline style helpers (so you definitely see borders)
  const cardBase: React.CSSProperties = {
    background: "#fff",
    borderRadius: 12,
    boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
    display: "flex",
    gap: 12,
    padding: 16,
    alignItems: "flex-start",
  };
  const leftPanelStyle: React.CSSProperties = {
    width: "32%",
    padding: 16,
    overflowY: "auto",
    boxSizing: "border-box",
    borderRight: "1px solid #e5e7eb",
    background: "#f8fafc",
  };
  const rightPanelStyle: React.CSSProperties = {
    flex: 1,
    padding: 16,
    overflowY: "auto",
    boxSizing: "border-box",
  };
  const deviceBoxStyle: React.CSSProperties = {
    padding: 8,
    borderRadius: 8,
    background: "#f3f4f6",
    border: "1px solid #e5e7eb",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  };

  return (
    <div style={{ display: "flex", height: "100vh", background: "#f1f5f9", fontFamily: "Inter, Arial, sans-serif" }}>
      {/* Left: Patient cards */}
      <div style={leftPanelStyle}>
        <h1 style={{ margin: 0, marginBottom: 12 }}>Patients</h1>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {patients.map((p) => {
            const batteryPct = patientBatteryPercent(p.devices);
            const leftStripe = batteryColorFromPercent(batteryPct);

            return (
              <div key={p.id} style={{ ...cardBase, borderLeft: `8px solid ${leftStripe}` }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
                    {p.name}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {p.devices.map((d) => (
                      <div key={d.name} style={deviceBoxStyle}>
                        <div>
                          <div style={{ fontWeight: 600 }}>{d.name}</div>
                        </div>
                        <div style={{ textAlign: "right", minWidth: 80 }}>
                          <div style={{ fontSize: 12, color: "#6b7280" }}>🔋</div>
                          <div style={{ fontWeight: 700 }}>{normalizeBattery(d.battery)}%</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: Live Telemetry (charts) */}
      <div style={rightPanelStyle}>
        <h1 style={{ margin: 0, marginBottom: 12 }}>Live Telemetry</h1>

        {/* Grid of charts: one chart per patient-device */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
          {patients.flatMap((p) =>
            p.devices.map((d, idx) => {
              const key = `${p.id}__${d.name}`;
              return (
                <div key={key} style={{ background: "#fff", borderRadius: 10, padding: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.04)", border: "1px solid #e6e9ee" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ fontWeight: 700 }}>{p.name} — {d.name}</div>
                    <div style={{ color: d.alertLevel === "red" ? "#ef4444" : d.alertLevel === "yellow" ? "#eab308" : "#16a34a", fontWeight: 700 }}>
                      {d.alertLevel?.toUpperCase() ?? "OK"}
                    </div>
                  </div>

                  <div style={{ height: 140 }}>
                    <Line
                      ref={(el) => {
                        // @ts-ignore: react-chartjs-2 types
                        if (el?.chart) chartRefs.current.push(el.chart);
                      }}
                      data={{
                        labels: d.readings.map((r) => r.time),
                        datasets: [
                          {
                            label: d.name,
                            data: d.readings.map((r) => r.value),
                            borderColor: "#2563eb",
                            backgroundColor: "rgba(37,99,235,0.08)",
                            tension: 0.35,
                            fill: true,
                          },
                        ],
                      }}
                      options={{
                        animation: { duration: 0 },
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false }, tooltip: { mode: "index" } },
                        scales: {
                          x: { ticks: { maxRotation: 0 }, grid: { display: false } },
                          y: { grid: { color: "#f3f4f6" } },
                        },
                      }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
