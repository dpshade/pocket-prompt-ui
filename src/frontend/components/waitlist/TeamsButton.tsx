import { Package } from 'lucide-react';
import { Button } from '@/frontend/components/ui/button';
import { Badge } from '@/frontend/components/ui/badge';

interface PacksButtonProps {
  onClick: () => void;
}

export function PacksButton({ onClick }: PacksButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className="gap-2 h-10 px-3"
    >
      <Package className="h-4 w-4" />
      <span className="hidden sm:inline">Packs</span>
      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
        Soon
      </Badge>
    </Button>
  );
}

// Keep old export for backwards compatibility during transition
export { PacksButton as TeamsButton };
