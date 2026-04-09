"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { connectTrelloAction } from "@/app/integrations/actions";

export function TrelloTokenForm() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);

    const formData = new FormData(event.currentTarget);
    
    try {
      const response = await connectTrelloAction(formData);
      
      if (response.success) {
        toast({
          title: "Success",
          description: response.message,
        });
        router.push("/integrations");
        router.refresh();
      } else {
        toast({
          title: "Error",
          description: response.error || response.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Connect Trello</CardTitle>
        <CardDescription>
          Enter your Trello API token to connect your account.
          You can generate a token from your Trello account settings.
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="trelloToken">Trello API Token</Label>
            <Input
              id="trelloToken"
              name="trelloToken"
              type="password"
              placeholder="Enter your Trello API token"
              required
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Connecting..." : "Connect Trello"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
} 