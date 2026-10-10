import { useState } from 'react';

import { track } from '@/analytics/track';
import { csvFileName, predictionsToCsv } from '@/export/csv';
import { shareTextFile, type ExportOutcome } from '@/export/file';
import { usePredictionStore } from '@/store/predictionStore';

const EXPORT_MESSAGES: Record<Exclude<ExportOutcome, 'shared'>, string> = {
  unavailable: "Exporting isn't available on this device.",
  failed: "Couldn't build the file. Try again?",
};

/**
 * Every prediction, open and answered, as a CSV through the share sheet.
 * Free since 2026-10-10 (roadmap D31): it's the user's own data. Shared by
 * You's "Export predictions (CSV)" row and Trends' button.
 */
export function useCsvExport(): {
  exporting: boolean;
  message: string | null;
  run: () => Promise<void>;
} {
  const pending = usePredictionStore((s) => s.pending);
  const resolved = usePredictionStore((s) => s.resolved);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const run = async () => {
    setExporting(true);
    setMessage(null);
    try {
      const all = [...pending, ...resolved];
      const outcome = await shareTextFile(
        csvFileName(),
        predictionsToCsv(all),
        'text/csv',
        'Export your predictions',
      );
      setMessage(outcome === 'shared' ? null : EXPORT_MESSAGES[outcome]);
      if (outcome === 'shared') void track('data_exported', { row_count: all.length });
    } finally {
      setExporting(false);
    }
  };

  return { exporting, message, run };
}
