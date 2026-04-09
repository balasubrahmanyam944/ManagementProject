import PageHeader from "@/components/page-header";
import SentimentForm from "@/components/sentiment/sentiment-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Smile, Brain, TrendingUp, MessageCircle, Sparkles, Zap } from "lucide-react";

export default function SentimentAnalysisPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Sentiment Analysis"
        icon={<Smile className="h-5 w-5 text-white" />}
        gradient="from-green-500 to-emerald-500"
        description="Analyze sentiment in project comments and descriptions to identify potential roadblocks."
      />
      
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SentimentForm />
        </div>
        
        <div className="lg:col-span-1 space-y-6">
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border/50 bg-gradient-to-r from-green-500/5 to-emerald-500/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center shadow-lg">
                  <Brain className="h-5 w-5 text-white" />
                </div>
                <CardTitle>How it Works</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-6">
                {/* AI Visual Placeholder */}
                <div className="relative rounded-xl bg-gradient-to-br from-green-500/10 via-emerald-500/5 to-teal-500/10 p-8 overflow-hidden">
                  <div className="absolute inset-0 dot-pattern opacity-30" />
                  <div className="relative flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center mb-4 shadow-lg animate-float">
                      <Sparkles className="h-8 w-8 text-white" />
                    </div>
                    <h3 className="font-semibold text-lg mb-1">AI-Powered Analysis</h3>
                    <p className="text-sm text-muted-foreground">
                      Understand emotions behind your project communications
                    </p>
                  </div>
                </div>
                
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Our AI-powered sentiment analysis tool processes text from your project tickets 
                  to determine the underlying emotion—whether positive, negative, or neutral.
                </p>
                
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-green-500 flex items-center justify-center shrink-0">
                      <MessageCircle className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Analyze Comments</p>
                      <p className="text-xs text-muted-foreground">Process ticket comments and descriptions</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shrink-0">
                      <TrendingUp className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Gauge Team Morale</p>
                      <p className="text-xs text-muted-foreground">Identify potential issues early</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shrink-0">
                      <Zap className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Take Action</p>
                      <p className="text-xs text-muted-foreground">Proactively address concerns</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
