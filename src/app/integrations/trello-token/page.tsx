import { TrelloTokenForm } from "@/components/integrations/TrelloTokenForm";
import PageHeader from "@/components/page-header";

export default function TrelloTokenPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Connect Trello"
        description="Enter your Trello API token to connect your account."
      />
      <TrelloTokenForm />
    </div>
  );
} 