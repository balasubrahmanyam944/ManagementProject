// src/components/dashboard/overview-chart.tsx
"use client"

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts"
import { ChartConfig, ChartContainer, ChartTooltipContent } from "@/components/ui/chart"

const chartData = [
  { month: "January", created: 186, completed: 80 },
  { month: "February", created: 305, completed: 200 },
  { month: "March", created: 237, completed: 120 },
  { month: "April", created: 273, completed: 190 },
  { month: "May", created: 209, completed: 130 },
  { month: "June", created: 214, completed: 140 },
]

const chartConfig = {
  created: {
    label: "Tasks Created",
    color: "hsl(var(--chart-1))",
  },
  completed: {
    label: "Tasks Completed",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig

export function OverviewChart() {
  return (
    <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="month"
            tickLine={false}
            tickMargin={10}
            axisLine={false}
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickFormatter={(value) => `${value}`}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--accent) / 0.3)" }}
            content={<ChartTooltipContent hideLabel />}
          />
          <Legend />
          <Bar dataKey="created" fill="var(--color-created)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="completed" fill="var(--color-completed)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  )
}
