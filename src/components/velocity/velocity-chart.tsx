// src/components/velocity/velocity-chart.tsx
"use client"

import { Line, LineChart, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts"
import { ChartConfig, ChartContainer, ChartTooltipContent } from "@/components/ui/chart"

const chartData = [
  { sprint: "Sprint 1", committed: 40, completed: 35 },
  { sprint: "Sprint 2", committed: 45, completed: 42 },
  { sprint: "Sprint 3", committed: 38, completed: 38 },
  { sprint: "Sprint 4", committed: 50, completed: 45 },
  { sprint: "Sprint 5", committed: 42, completed: 39 },
  { sprint: "Sprint 6", committed: 48, completed: 48 },
];

const chartConfig = {
  committed: {
    label: "Committed Points",
    color: "hsl(var(--chart-1))",
  },
  completed: {
    label: "Completed Points",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;

export function VelocityChart() {
  return (
    <ChartContainer config={chartConfig} className="min-h-[350px] w-full">
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="sprint"
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickFormatter={(value) => `${value} pts`}
          />
          <Tooltip
            cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1.5, strokeDasharray: "3 3" }}
            content={<ChartTooltipContent indicator="line" hideLabel />}
          />
          <Legend />
          <Line
            dataKey="committed"
            type="monotone"
            stroke="var(--color-committed)"
            strokeWidth={2.5}
            dot={{
              fill: "var(--color-committed)",
              r: 4,
            }}
            activeDot={{
              r: 6,
            }}
          />
          <Line
            dataKey="completed"
            type="monotone"
            stroke="var(--color-completed)"
            strokeWidth={2.5}
            dot={{
              fill: "var(--color-completed)",
              r: 4,
            }}
            activeDot={{
              r: 6,
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartContainer>
  )
}
