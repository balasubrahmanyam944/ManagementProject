"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { debugCookiesAction, clearAllIntegrationCookiesAction } from "../actions";

export default function IntegrationDebugPage() {
  const [cookies, setCookies] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const checkCookies = () => {
    startTransition(async () => {
      const result = await debugCookiesAction();
      setCookies(result.cookies);
    });
  };

  const clearCookies = () => {
    startTransition(async () => {
      const result = await clearAllIntegrationCookiesAction();
      if (result.success) {
        toast({
          title: "Success",
          description: result.message,
        });
        setCookies({});
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to clear cookies",
          variant: "destructive",
        });
      }
    });
  };

  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Integration Debug</CardTitle>
          <CardDescription>
            Debug integration connection status and cookies
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button onClick={checkCookies} disabled={isPending}>
              Check Cookies
            </Button>
            <Button onClick={clearCookies} variant="destructive" disabled={isPending}>
              Clear All Integration Cookies
            </Button>
          </div>
          
          {Object.keys(cookies).length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-2">Current Integration Cookies:</h3>
              <div className="space-y-2">
                {Object.entries(cookies).map(([name, value]) => (
                  <div key={name} className="p-2 bg-gray-100 rounded">
                    <strong>{name}:</strong> {value.substring(0, 50)}{value.length > 50 ? '...' : ''}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {Object.keys(cookies).length === 0 && (
            <p className="text-muted-foreground">No integration cookies found or not checked yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 