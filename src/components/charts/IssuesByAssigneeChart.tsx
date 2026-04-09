"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { AssigneeChartData } from '@/lib/data/processors/assignee-processor';

interface IssuesByAssigneeChartProps {
  data: AssigneeChartData[];
  title?: string;
  onBarClick?: (assigneeName: string) => void;
}

// Color for the bars - can be customized
const BAR_COLOR = '#82ca9d';

export default function IssuesByAssigneeChart({ 
  data, 
  title = "Issues by Assignee",
  onBarClick
}: IssuesByAssigneeChartProps) {
  // If no data or empty array, show a message
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">No assignee data available</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      {title && <h3 className="text-sm font-medium mb-2">{title}</h3>}
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          layout="vertical"
          data={data}
          margin={{
            top: 5,
            right: 30,
            left: 60, // More space for assignee names
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis type="category" dataKey="name" width={100} />
          <Tooltip formatter={(value: number) => [`${value} issues`, 'Count']} />
          <Legend />
          <Bar 
            dataKey="value" 
            fill={BAR_COLOR} 
            name="Issues" 
            onClick={onBarClick ? (data) => onBarClick(data.name) : undefined}
            style={onBarClick ? { cursor: 'pointer' } : undefined}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Re-export the data type
export type { AssigneeChartData };
