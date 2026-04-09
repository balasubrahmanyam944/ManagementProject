import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Filter, BarChart3, TrendingUp, Target, Zap, ArrowUpRight, ArrowDownRight, Sparkles } from "lucide-react";
import { VelocityChart } from "@/components/velocity/velocity-chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function VelocityPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Velocity Tracking"
        icon={<BarChart3 className="h-5 w-5 text-white" />}
        gradient="from-amber-500 to-orange-500"
        description="Monitor your team's sprint velocity and historical performance."
        actions={
          <Button variant="outline" className="rounded-full">
            <Download className="mr-2 h-4 w-4" />
            Export Data
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border/50 bg-gradient-to-r from-amber-500/5 to-orange-500/5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg">
                <TrendingUp className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle>Sprint Velocity History</CardTitle>
                <CardDescription>Committed vs. Completed story points over sprints</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select defaultValue="project-a">
                <SelectTrigger className="w-[160px] rounded-lg">
                  <SelectValue placeholder="Select Project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="project-a">Project Alpha</SelectItem>
                  <SelectItem value="project-b">Project Beta</SelectItem>
                  <SelectItem value="project-c">Project Gamma</SelectItem>
                </SelectContent>
              </Select>
              <Select defaultValue="last-6-months">
                <SelectTrigger className="w-[160px] rounded-lg">
                  <SelectValue placeholder="Select Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="last-3-months">Last 3 Sprints</SelectItem>
                  <SelectItem value="last-6-months">Last 6 Sprints</SelectItem>
                  <SelectItem value="last-12-months">Last 12 Sprints</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <VelocityChart />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 stagger-children">
        {/* Average Velocity */}
        <Card className="group relative overflow-hidden card-hover">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary to-purple-500" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Average Velocity</CardTitle>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center shadow-lg">
                <Zap className="h-5 w-5 text-white" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold">38</span>
              <span className="text-lg text-muted-foreground">pts</span>
            </div>
            <div className="flex items-center gap-1 mt-2 text-emerald-600 dark:text-emerald-400">
              <ArrowUpRight className="h-4 w-4" />
              <span className="text-sm font-medium">+3 pts from last period</span>
            </div>
          </CardContent>
        </Card>

        {/* Completion Rate */}
        <Card className="group relative overflow-hidden card-hover">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Completion Rate</CardTitle>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg">
                <Target className="h-5 w-5 text-white" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold">92</span>
              <span className="text-lg text-muted-foreground">%</span>
            </div>
            <div className="flex items-center gap-1 mt-2 text-muted-foreground">
              <span className="text-sm">Consistent over last 3 sprints</span>
            </div>
          </CardContent>
        </Card>

        {/* Sprint Commitment */}
        <Card className="group relative overflow-hidden card-hover">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-orange-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-orange-500" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Sprint Commitment</CardTitle>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg">
                <BarChart3 className="h-5 w-5 text-white" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold">42</span>
              <span className="text-lg text-muted-foreground">pts</span>
            </div>
            <div className="flex items-center gap-1 mt-2 text-muted-foreground">
              <span className="text-sm">Current sprint target</span>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Team Performance Visual */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center shadow-lg">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <CardTitle>Team Performance Snapshot</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="relative w-full overflow-hidden bg-gradient-to-br from-primary/5 via-purple-500/5 to-accent/5 p-8 md:p-12">
            <div className="absolute inset-0 dot-pattern opacity-30" />
            <div className="relative flex flex-col items-center justify-center text-center max-w-2xl mx-auto">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center mb-6 shadow-lg animate-float">
                <TrendingUp className="h-10 w-10 text-white" />
              </div>
              <h3 className="text-2xl font-bold mb-3">Excellent Team Performance!</h3>
              <p className="text-muted-foreground mb-6">
                Your team has maintained a consistent velocity with a high completion rate over the past sprints. 
                Keep up the great work!
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <div className="px-4 py-2 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-sm font-medium">
                  ✓ On Track
                </div>
                <div className="px-4 py-2 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm font-medium">
                  ↗ Improving
                </div>
                <div className="px-4 py-2 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-sm font-medium">
                  ★ High Quality
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
