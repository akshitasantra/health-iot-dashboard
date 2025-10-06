import React, { useEffect, useState } from "react";

type SummaryResp = {
  patient_id: number;
  summary_text: string;
  source: string;
  created_at: string;
};

export default function HealthSummary({ patientId }: { patientId: number }) {
  const [summary, setSummary] = useState<SummaryResp | null>(null);

  const fetchSummary = async () => {
    try {
      const resp = await fetch(`/api/patients/${patientId}/summary`);
      if (resp.ok) setSummary(await resp.json());
    } catch (e) {
      console.error("Failed to load summary:", e);
    }
  };

  useEffect(() => {
    fetchSummary();                    // first load
    const id = setInterval(fetchSummary, 60_000); // every 60 s
    return () => clearInterval(id);
  }, [patientId]);

  if (!summary)
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
        <p className="text-gray-500">Loading AI Health Summary...</p>
      </div>
    );

  return (
    <div className="bg-white border border-gray-300 rounded-2xl p-4 shadow-md">
      <h3 className="text-xl font-bold mb-2 text-gray-800">AI Health Summary</h3>
      <p className="text-gray-700">{summary.summary_text}</p>
      <p className="text-sm text-gray-400 mt-2">
        Updated {new Date(summary.created_at).toLocaleTimeString()}
      </p>
    </div>
  );
}
