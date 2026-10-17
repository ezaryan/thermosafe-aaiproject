import React from 'react';
import { ForecastPoint } from '../../types';
import { getRiskColor } from '../../utils/helpers';

interface Props {
  timeline: ForecastPoint[];
}

export const ForecastTimeline: React.FC<Props> = ({ timeline }) => {
  return (
    <div className="glass-card p-6">
      <h3 className="text-lg font-medium text-white mb-6">24-Hour Forecast</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
        {timeline.map((pt, i) => (
            <div key={i} className="min-w-0 rounded-xl border border-white/10 bg-dark-800/60 p-3 text-center">
              <span className="block text-sm font-medium text-gray-300">{pt.time}</span>
              <span
                className="mx-auto my-2 block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: getRiskColor(pt.riskLevel) }}
                aria-label={`${pt.riskLevel} risk`}
              />
              <span className="block text-lg font-bold text-white">{pt.temperature.toFixed(2)}°</span>
              <span className="mt-1 block text-sm text-gray-400">HTSS: {pt.htss.toFixed(2)}</span>
              <span className="mt-1 block truncate text-xs text-gray-500">{pt.riskLevel}</span>
            </div>
        ))}
      </div>
    </div>
  );
};
