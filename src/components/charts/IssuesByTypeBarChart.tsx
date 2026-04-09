"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// Define the data structure expected by this component
export interface TypeChartData {
  name: string;
  value: number;
}

interface IssuesByTypeBarChartProps {
  data: TypeChartData[];
  title?: string;
  onBarClick?: (typeName: string) => void;
}

// Color for the bars - can be customized
const BAR_COLOR = '#8884d8';

export default function IssuesByTypeBarChart({ 
  data, 
  title = "Issues by Type",
  onBarClick
}: IssuesByTypeBarChartProps) {
  // If no data or empty array, show a message
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">No type data available</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      {title && <h3 className="text-sm font-medium mb-2">{title}</h3>}
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={data}
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
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
