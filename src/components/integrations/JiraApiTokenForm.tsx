"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { connectJiraWithApiTokenAction, type IntegrationActionResponse } from "@/app/integrations/actions";
import { Loader2, LinkIcon } from "lucide-react";

interface JiraApiTokenFormProps {
  onSuccess: () => void; // Callback to notify parent on successful connection
}

export function JiraApiTokenForm({ onSuccess }: JiraApiTokenFormProps) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!email || !apiToken || !siteUrl) {
      setError("All fields are required.");
      return;
    }
    if (!siteUrl.startsWith("https://")) {
      setError("Jira Site URL must start with https://");
      return;
    }

    const formData = new FormData();
    formData.append("jiraEmail", email);
    formData.append("jiraApiToken", apiToken);
    formData.append("jiraSiteUrl", siteUrl);

    startTransition(async () => {
      const response = await connectJiraWithApiTokenAction(formData);
      if (response.success) {
        toast({
          title: "Jira Connected",
          description: response.message || "Successfully connected to Jira using API Token.",
        });
        onSuccess(); // Notify parent component
      } else {
        toast({
          title: "Jira Connection Failed",
          description: response.message || response.error || "An unknown error occurred.",
          variant: "destructive",
        });
        setError(response.message || response.error || "Failed to connect.");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="jiraEmail">Jira Email Address</Label>
        <Input
          id="jiraEmail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          disabled={isPending}
          required
        />
      </div>
      <div>
        <Label htmlFor="jiraApiToken">Jira API Token</Label>
        <Input
          id="jiraApiToken"
          type="password"
          value={apiToken}
          onChange={(e) => setApiToken(e.target.value)}
          placeholder="Your Jira API Token"
          disabled={isPending}
          required
        />
         <p className="text-xs text-muted-foreground mt-1">
          Generate from your Atlassian account security settings.
        </p>
      </div>
      <div>
        <Label htmlFor="jiraSiteUrl">Jira Site URL</Label>
        <Input
          id="jiraSiteUrl"
          type="url"
          value={siteUrl}
          onChange={(e) => setSiteUrl(e.target.value)}
          placeholder="https://your-instance.atlassian.net"
          disabled={isPending}
          required
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <LinkIcon className="mr-2 h-4 w-4" />
        )}
        Connect Jira with API Token
      </Button>
    </form>
  );
}
