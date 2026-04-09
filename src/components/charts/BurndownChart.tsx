"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

// Define the data structure expected by this component
export interface BurndownChartData {
  date: string;
  remaining: number;
  ideal: number;
}

interface BurndownChartProps {
  data: BurndownChartData[];
  title?: string;
  startDate?: string;
  endDate?: string;
  totalScope?: number;
}

export default function BurndownChart({ 
  data, 
  title = "Sprint Burndown", 
  startDate, 
  endDate,
  totalScope
}: BurndownChartProps) {
  // If no data or empty array, show a message
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">No burndown data available</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      {title && <h3 className="text-sm font-medium mb-2">{title}</h3>}
      {(startDate || endDate) && (
        <div className="text-xs text-muted-foreground mb-2">
          {startDate && <span>Start: {startDate}</span>}
          {startDate && endDate && <span> | </span>}
          {endDate && <span>End: {endDate}</span>}
        </div>
      )}
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart
          data={data}
          margin={{
            top: 10,
            right: 30,
            left: 0,
            bottom: 0,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip formatter={(value: number) => [`${value} points`, 'Points']} />
          <Legend />
          <ReferenceLine y={0} stroke="#000" />
          <Area type="monotone" dataKey="ideal" stroke="#8884d8" fill="#8884d8" fillOpacity={0.1} name="Ideal Burndown" strokeDasharray="5 5" />
          <Area type="monotone" dataKey="remaining" stroke="#82ca9d" fill="#82ca9d" fillOpacity={0.3} name="Actual Remaining" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
