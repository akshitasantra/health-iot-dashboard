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
const REDRAW_MS = 50;
const backendHost = import.meta.env.VITE_BACKEND_URL;


export default function App(){
  const [patients, setPatients] = useState<Patient[]>([]);
  const [healthSummaries, setHealthSummaries] = useState<{
    [patientId: string]: { summary: string; lastUpdated: number | null };
    }>({});
    const [summaryHighlights, setSummaryHighlights] = useState<{ [patientId: string]: boolean }>({});
    
  const patientsRef = useRef<Patient[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const chartRefs = useRef<Record<string, Chart | null>>({});
  const [lastUpdated, setLastUpdated] = useState<string>("—");
  
  // keep ref synced
  useEffect(() => {
    patientsRef.current = patients;
  }, [patients]);

  // helper functions (same as before)
  function computePatientAnalytics(patient: Patient) {
    const temps = patient.devices
      .filter((d) => typeof d.temperature === "number")
      .map((d) => d.temperature as number);

    const hrs = patient.devices
      .filter((d) => typeof d.heartRate === "number")
      .map((d) => d.heartRate as number);

    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN);
    const min = (arr: number[]) => (arr.length ? Math.min(...arr) : NaN);
    const max = (arr: number[]) => (arr.length ? Math.max(...arr) : NaN);

    return {
      avgTemp: avg(temps),
      minTemp: min(temps),
      maxTemp: max(temps),
      avgHR: avg(hrs),
      minHR: min(hrs),
      maxHR: max(hrs),
      deviceCount: patient.devices.length,
    };
  }

  const normalizeBattery = (raw: number | undefined): number => {
    if (raw === undefined || raw === null) return 0;
    if (raw <= 1) return Math.round(raw * 100);
    return Math.round(raw);
  };

  const patientBatteryPercent = (devices: Device[]): number => {
    if (!devices || devices.length === 0) return 0;
    const values = devices.map((d) => normalizeBattery(d.battery));
    return Math.min(...values);
  };

  const batteryColorFromPercent = (pct: number): string => {
    if (pct < 40) return "#ef4444";
    if (pct < 75) return "#eab308";
    return "#16a34a";
  };

  const alertColor = (level?: "green" | "yellow" | "red") => {
    if (level === "red") return { border: "#ef4444", fill: "rgba(239,68,68,0.08)" };
    if (level === "yellow") return { border: "#eab308", fill: "rgba(234,179,8,0.08)" };
    return { border: "#16a34a", fill: "rgba(22,163,74,0.08)" };
  };


  useEffect(() => {
    let temps: number[] = [];
    let hrs: number[] = [];
    let deviceCount = 0;

    patients.forEach((p) => {
      p.devices.forEach((d) => {
        deviceCount += 1;
        if (typeof d.temperature === "number") temps.push(d.temperature);
        if (typeof d.heartRate === "number") hrs.push(d.heartRate);
      });
    });
  }, [patients]);



  useEffect(() => {
    // dynamic ws url:
    location.hostname === "127.0.0.1";
    const WS_URL = import.meta.env.VITE_WS_URL;


    console.log("Attempting WS connection to", WS_URL);

    let ws: WebSocket | null = null;
    let reconnectAttempts = 0;
    let reconnectTimer: number | null = null;
    const MAX_RECONNECT_DELAY = 30_000; // 30s

    const connect = () => {
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.info("WS connected", WS_URL);
        reconnectAttempts = 0;
      };

      ws.onerror = (err) => {
        console.warn("WS error", err);
      };

      ws.onclose = (ev) => {
        console.info("WS closed", ev.code, ev.reason);
        // try to reconnect with backoff
        reconnectAttempts += 1;
        const delay = Math.min(1000 * 2 ** reconnectAttempts, MAX_RECONNECT_DELAY);
        if (reconnectTimer) window.clearTimeout(reconnectTimer);
        reconnectTimer = window.setTimeout(() => connect(), delay);
      };

      ws.onmessage = (ev) => {
        try {
          const incoming = JSON.parse(ev.data); // expected: Patient[]
          if (!Array.isArray(incoming)) return;

          // inside ws.onmessage: replace the device mapping with this
          const mapped: Patient[] = incoming.map((p: any) => {
            const devices: Device[] = (p.devices ?? []).map((d: any) => {
              const rawReadings = d.readings ?? [];

              // normalize readings (same as you already do)
              const readings: Reading[] = rawReadings.map((r: any) => {
                try {
                  if (r == null) return { time: new Date().toLocaleTimeString(), value: 0 };
                  if (typeof r === "number") return { time: new Date().toLocaleTimeString(), value: r };
                  if (typeof r === "object") {
                    const value = typeof r.value === "number" ? r.value : Number(r.value ?? r) || 0;
                    let timeStr = new Date().toLocaleTimeString();
                    if (r.time) {
                      if (typeof r.time === "number") timeStr = new Date(r.time * 1000).toLocaleTimeString();
                      else timeStr = String(r.time);
                    }
                    return { time: timeStr, value };
                  }
                  return { time: new Date().toLocaleTimeString(), value: Number(r) || 0 };
                } catch {
                  return { time: new Date().toLocaleTimeString(), value: 0 };
                }
              });

              // ---- NEW: infer latest sensor numeric value from readings ----
              const latestReading = rawReadings.length ? rawReadings[rawReadings.length - 1] : null;
              const latestValue = latestReading ? (typeof latestReading === "object" ? Number(latestReading.value ?? 0) : Number(latestReading)) : 0;

              // decide where latestValue should live: temperature or heartRate
              let inferredTemp: number | undefined = undefined;
              let inferredHR: number | undefined = undefined;
              const name = String(d.name ?? "").toLowerCase();
              if (name.includes("temp")) inferredTemp = latestValue;
              if (name.includes("heart")) inferredHR = latestValue;

              return {
                id: d.id,
                name: d.name,
                // prefer explicit fields if backend provided them; otherwise use inferred value
                temperature: typeof d.temperature === "number" ? d.temperature : inferredTemp,
                heartRate: typeof d.heartRate === "number" ? d.heartRate : inferredHR,
                battery: typeof d.battery === "number" ? d.battery : 0,
                alertLevel: d.alertLevel ?? "green",
                readings: readings.slice(-MAX_POINTS),
              } as Device;
            });

            return {
              id: p.id,
              name: p.name,
              devices,
            } as Patient;
          });

          setPatients(mapped);
          setLastUpdated(new Date().toLocaleTimeString());
        } catch (err) {
          console.error("Failed to parse WS message", err);
        }
      };
    };

    const tryFetchInitial = async () => {
      try {
        const resp = await fetch(`${backendHost}/api/patients`);
        const json = await resp.json();
        if (!Array.isArray(json)) return;

        const mapped: Patient[] = json.map((p: any) => {
          const devices: Device[] = (p.devices ?? []).map((d: any) => {
            const rawReadings = d.readings ?? [];
            const readings: Reading[] = rawReadings.map((r: any) => {
              if (r == null) return { time: new Date().toLocaleTimeString(), value: 0 };
              if (typeof r === "number") return { time: new Date().toLocaleTimeString(), value: r };
              if (typeof r === "object") {
                const value = typeof r.value === "number" ? r.value : Number(r.value ?? r) || 0;
                let timeStr = new Date().toLocaleTimeString();
                if (r.time) {
                  if (typeof r.time === "number") timeStr = new Date(r.time * 1000).toLocaleTimeString();
                  else timeStr = String(r.time);
                }
                return { time: timeStr, value };
              }
              return { time: new Date().toLocaleTimeString(), value: Number(r) || 0 };
            });

            // infer latest value
            const latestReading = rawReadings.length ? rawReadings[rawReadings.length - 1] : null;
            const latestValue = latestReading ? (typeof latestReading === "object" ? Number(latestReading.value ?? 0) : Number(latestReading)) : 0;

            let inferredTemp: number | undefined = undefined;
            let inferredHR: number | undefined = undefined;
            const name = String(d.name ?? "").toLowerCase();
            if (name.includes("temp")) inferredTemp = latestValue;
            if (name.includes("heart")) inferredHR = latestValue;

            return {
              id: d.id,
              name: d.name,
              battery: typeof d.battery === "number" ? d.battery : 0,
              alertLevel: d.alertLevel ?? "green",
              temperature: typeof d.temperature === "number" ? d.temperature : inferredTemp,
              heartRate: typeof d.heartRate === "number" ? d.heartRate : inferredHR,
              readings: readings.slice(-MAX_POINTS),
            } as Device;
          });

          return {
            id: p.id,
            name: p.name,
            devices,
          } as Patient;
        });

        setPatients(mapped);
        setLastUpdated(new Date().toLocaleTimeString());
      } catch (e) {
        console.error("Failed to fetch initial patients", e);
      }
    };

    // start
    tryFetchInitial();
    connect();

    return () => {
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      try {
        ws?.close();
      } catch {}
      wsRef.current = null;
    };
  }, []); // run only once on mount


  // stable interval for AI summaries (reads patientsRef.current)
  useEffect(() => {
    const generate = () => {
      const current = patientsRef.current;
      const newSummaries: Record<number, string> = {};

      for (const p of current) {
        const temps = p.devices.filter((d) => typeof d.temperature === "number").map((d) => d.temperature as number);
        const hrs = p.devices.filter((d) => typeof d.heartRate === "number").map((d) => d.heartRate as number);
        const avgTemp = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : 0;
        const avgHR = hrs.length ? hrs.reduce((a, b) => a + b, 0) / hrs.length : 0;

        let summary = `${p.name}: Vitals stable.`;
        if (avgTemp > 99) summary = `${p.name}: Temperature slightly elevated.`;
        if (avgHR > 100) summary = `${p.name}: Elevated heart rate detected.`;

        newSummaries[p.id] = summary;
      }

      // compare with previous and trigger highlight if changed
      setHealthSummaries((prev) => {
        const updated: typeof prev = { ...prev };
        for (const p of current) {
          const temps = p.devices.filter(d => typeof d.temperature === "number").map(d => d.temperature!);
          const hrs = p.devices.filter(d => typeof d.heartRate === "number").map(d => d.heartRate!);
          const avgTemp = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : 0;
          const avgHR = hrs.length ? hrs.reduce((a, b) => a + b, 0) / hrs.length : 0;

          let summary = `${p.name}: Vitals stable.`;
          if (avgTemp > 99) summary = `${p.name}: Temperature slightly elevated.`;
          if (avgHR > 100) summary = `${p.name}: Elevated heart rate detected.`;

          if (!prev[p.id] || prev[p.id].summary !== summary) {
            setSummaryHighlights((h) => ({ ...h, [p.id]: true }));
            setTimeout(() => setSummaryHighlights((h) => ({ ...h, [p.id]: false })), 3000);
          }

          updated[p.id] = { summary, lastUpdated: Date.now() };
        }
        return updated;
      });
    };

    generate();
    const interval = setInterval(generate, 30_000); // every 30s
    return () => clearInterval(interval);
  }, []);

  // chart redraw loop
  useEffect(() => {
    let raf: number | null = null;
    const tick = () => {
      Object.values(chartRefs.current).forEach((c) => {
        try {
          if (c && (c as any).update) (c as any).update("none");
        } catch {}
      });
      raf = window.setTimeout(() => requestAnimationFrame(tick), REDRAW_MS) as unknown as number;
    };
    requestAnimationFrame(tick);
    return () => {
      if (raf) clearTimeout(raf);
    };
  }, []);


  // styles (keeps layout consistent)
  const leftPanelStyle: React.CSSProperties = { padding: 16, overflowY: "auto", borderRight: "1px solid #e5e7eb", background: "#f8fafc", minWidth: 280 };
  const centerPanelStyle: React.CSSProperties = { padding: 16, overflowY: "auto", boxSizing: "border-box", minWidth: 420 };
  const rightPanelStyle: React.CSSProperties = { padding: 16, borderLeft: "1px solid #e5e7eb", background: "#fafafa", overflowY: "auto", boxSizing: "border-box", width: "100%" };

  return (
    <div style={{ height: "100vh", background: "#f1f5f9", fontFamily: "Inter, Arial, sans-serif", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header style={{ padding: "12px 20px", borderBottom: "1px solid #e6e9ee", background: "#ffffff", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Health IoT Dashboard</h1>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
            Last updated: <span style={{ fontWeight: 700, color: "#374151" }}>{lastUpdated}</span>
          </div>
        </div>
        {/* small right-side place for live status if desired */}
        <div style={{ fontSize: 12, color: "#6b7280" }}>Live</div>
      </header>

      {/* Main grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "34% 1fr 320px",
        flex: 1,            // allow grid to take remaining height
        overflow: "hidden"  // keep panels layout stable
      }}>

      {/* LEFT: Patients */}
      <div style={leftPanelStyle}>
        <h1 style={{ margin: 0, marginBottom: 12 }}>Patients</h1>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {patients.map((p) => {
            const batteryPct = patientBatteryPercent(p.devices);
            const leftStripe = batteryColorFromPercent(batteryPct);

            // SORT devices: Heart first, Temperature second, then others
            const sortedDevices = [...p.devices].sort((a, b) => {
              if (a.name.toLowerCase().includes("heart")) return -1;
              if (b.name.toLowerCase().includes("heart")) return 1;
              if (a.name.toLowerCase().includes("temperature")) return -1;
              if (b.name.toLowerCase().includes("temperature")) return 1;
              return 0;
            });

            return (
              <div
                key={`patient-${p.id}`}
                style={{
                  background: "#fff",
                  borderRadius: 12,
                  boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
                  display: "flex",
                  gap: 12,
                  padding: 16,
                  borderLeft: `8px solid ${leftStripe}`,
                  alignItems: "flex-start",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{p.name}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {sortedDevices.map((d) => (
                      <div
                        key={`device-${d.id ?? d.name}`}
                        style={{
                          padding: 8,
                          borderRadius: 8,
                          background: "#f3f4f6",
                          border: "1px solid #e5e7eb",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>{d.name}</div>
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

      {/* CENTER: live telemetry */}
      <div style={centerPanelStyle}>
        <h1 style={{ margin: 0, marginBottom: 12 }}>Live Telemetry</h1>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
          {patients.flatMap((p) => {
            const sortedDevices = [...p.devices].sort((a, b) => {
              if (a.name.toLowerCase().includes("heart")) return -1;
              if (b.name.toLowerCase().includes("heart")) return 1;
              if (a.name.toLowerCase().includes("temperature")) return -1;
              if (b.name.toLowerCase().includes("temperature")) return 1;
              return 0;
            });

            return sortedDevices.map((d) => {
              const key = `${p.id}__${d.id ?? d.name}`;
              const colors = alertColor(d.alertLevel);
              return (
                <div key={key} style={{ background: "#fff", borderRadius: 10, padding: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.04)", border: "1px solid #e6e9ee" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ fontWeight: 700 }}>{p.name} — {d.name}</div>
                    <div style={{ color: colors.border, fontWeight: 700 }}>{(d.alertLevel ?? "green").toUpperCase()}</div>
                  </div>
                  <div style={{ height: 140 }}>
                    <Line
                      data={{
                        labels: d.readings.map((r) => r.time),
                        datasets: [
                          {
                            label: d.name,
                            data: d.readings.map((r) => r.value),
                            borderColor: colors.border,
                            backgroundColor: colors.fill,
                            tension: 0.35,
                            fill: true,
                            pointRadius: 0,
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
            });
          })}
        </div>
      </div>
      {/* RIGHT: AI summary + footer analytics */}
      <div style={rightPanelStyle}>
        <h1 style={{ margin: 0, marginBottom: 12 }}>AI Health Summary</h1>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {patients.map((p) => {
            const summaryData = healthSummaries[p.id] ?? { summary: "Analyzing vitals...", lastUpdated: null };
            const highlight = !!summaryHighlights[p.id];

            return (
              <div
                key={p.id}
                style={{
                  background: highlight ? "rgba(59,130,246,0.06)" : "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 6,
                  boxShadow: "0 4px 10px rgba(0,0,0,0.05)",
                  transition: "background-color 300ms ease",
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 8 }}>{p.name}</div>
                <div style={{ fontSize: 14, color: "#374151" }}>{summaryData.summary}</div>
                <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
                  Last summary: {summaryData.lastUpdated ? new Date(summaryData.lastUpdated).toLocaleTimeString() : "N/A"}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer analytics panel (per-patient) */}
        <div style={{ marginTop: 18, borderTop: "1px solid #e6e9ee", paddingTop: 12 }}>
          <h3 style={{ margin: "6px 0 12px 0" }}>Analytics (per patient)</h3>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 12
          }}>
            {patients.map((p) => {
              const pa = computePatientAnalytics(p);

              return (
                <div key={`analytics-${p.id}`} style={{ background: "#fff", padding: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}>
                  <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 6 }}>{p.name}</div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>Avg Temperature</div>
                      <div style={{ fontWeight: 700, fontSize: 18 }}>
                        {isFinite(pa.avgTemp) ? pa.avgTemp.toFixed(1) + " °F" : "—"}
                      </div>
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                        Min: {isFinite(pa.minTemp) ? pa.minTemp.toFixed(1) : "—"} • Max: {isFinite(pa.maxTemp) ? pa.maxTemp.toFixed(1) : "—"}
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>Avg Heart Rate</div>
                      <div style={{ fontWeight: 700, fontSize: 18 }}>
                        {isFinite(pa.avgHR) ? Math.round(pa.avgHR) + " BPM" : "—"}
                      </div>
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                        Min: {isFinite(pa.minHR) ? Math.round(pa.minHR) : "—"} • Max: {isFinite(pa.maxHR) ? Math.round(pa.maxHR) : "—"}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
                    Devices: <span style={{ fontWeight: 700, color: "#111" }}>{pa.deviceCount}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
    </div>
  );
}
