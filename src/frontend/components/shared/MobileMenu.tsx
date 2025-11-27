import { MoreVertical, Upload, Sun, Moon, Rocket } from 'lucide-react';
import { Button } from '@/frontend/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/frontend/components/ui/dropdown-menu';
import { useTheme } from '@/frontend/hooks/useTheme';

interface MobileMenuProps {
  onUploadClick: () => void;
  onWhatsNextClick?: () => void;
}

export function MobileMenu({ onUploadClick, onWhatsNextClick }: MobileMenuProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="relative h-10 w-10 sm:hidden"
        >
          <MoreVertical className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={2} className="w-48">
        <DropdownMenuItem onClick={onUploadClick}>
          <Upload className="mr-2 h-4 w-4" />
          <span>Import/Export</span>
        </DropdownMenuItem>
        {onWhatsNextClick && (
          <DropdownMenuItem onClick={onWhatsNextClick}>
            <Rocket className="mr-2 h-4 w-4" />
            <span>What's Next</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={toggleTheme}>
          {theme === 'dark' ? (
            <>
              <Sun className="mr-2 h-4 w-4" />
              <span>Light Mode</span>
            </>
          ) : (
            <>
              <Moon className="mr-2 h-4 w-4" />
              <span>Dark Mode</span>
            </>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
