"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// Define the data structure expected by this component
export interface TimelineChartData {
  date: string;
  created: number;
  resolved: number;
}

interface IssuesByTimelineChartProps {
  data: TimelineChartData[];
  title?: string;
}

export default function IssuesByTimelineChart({ data, title = "Issues Timeline" }: IssuesByTimelineChartProps) {
  // If no data or empty array, show a message
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">No timeline data available</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      {title && <h3 className="text-sm font-medium mb-2">{title}</h3>}
      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={data}
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip formatter={(value: number) => [`${value} issues`, 'Count']} />
          <Legend />
          <Line type="monotone" dataKey="created" stroke="#8884d8" name="Created" activeDot={{ r: 8 }} />
          <Line type="monotone" dataKey="resolved" stroke="#82ca9d" name="Resolved" activeDot={{ r: 8 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
