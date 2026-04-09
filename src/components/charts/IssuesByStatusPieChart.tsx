"use client";

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { StatusChartData } from '@/lib/data/processors/status-processor';

export interface IssuesByStatusPieChartProps {
  data: StatusChartData[];
  onSliceClick?: (statusName: string) => void;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export default function IssuesByStatusPieChart({ 
  data, 
  onSliceClick 
}: IssuesByStatusPieChartProps) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No status data available
      </div>
    );
  }

  const handleClick = (entry: any) => {
    if (onSliceClick) {
      onSliceClick(entry.name);
    }
  };

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart style={{ outline: 'none' }}>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
          outerRadius={80}
          fill="#8884d8"
          dataKey="value"
          onClick={handleClick}
          className="cursor-pointer outline-none focus:outline-none"
          style={{ outline: 'none' }}
        >
          {data.map((_, index: number) => (
            <Cell 
              key={`cell-${index}`} 
              fill={COLORS[index % COLORS.length]} 
              style={{ outline: 'none' }}
              className="outline-none focus:outline-none"
            />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

// Re-export the data type
export type { StatusChartData };
