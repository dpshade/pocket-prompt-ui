import { Users } from 'lucide-react';
import { Button } from '@/frontend/components/ui/button';
import { Badge } from '@/frontend/components/ui/badge';

interface TeamsButtonProps {
  onClick: () => void;
}

export function TeamsButton({ onClick }: TeamsButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className="gap-2 h-10 px-3"
    >
      <Users className="h-4 w-4" />
      <span className="hidden sm:inline">Teams</span>
      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
        Soon
      </Badge>
    </Button>
  );
}
