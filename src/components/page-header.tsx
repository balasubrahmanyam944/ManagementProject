import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  description?: string | ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  gradient?: string;
}

export default function PageHeader({ title, description, actions, icon, gradient }: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-col gap-y-4 sm:flex-row sm:items-start sm:justify-between animate-slide-in-top">
      <div className="flex-1">
        <div className="flex items-center gap-3 mb-2">
          {icon && (
            <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${gradient || 'from-primary to-purple-500'} flex items-center justify-center shadow-lg`}>
              {icon}
            </div>
          )}
          <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            {title}
          </h1>
          <Sparkles className="h-5 w-5 text-primary/50 animate-pulse hidden sm:block" />
        </div>
        {description && (
          <div className="mt-1 text-base text-muted-foreground max-w-2xl">
            {typeof description === 'string' ? <p>{description}</p> : description}
          </div>
        )}
      </div>
      {actions && (
        <div className="mt-4 shrink-0 sm:mt-0 flex items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
