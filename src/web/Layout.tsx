import { Monitor, Moon, Route, ShieldCheck, Sun } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTheme, type Theme } from '@/lib/theme';
import { cn } from '@/lib/utils';

/** Navigation entries; add a route in main.tsx and a link here to create a new page. */
const NAV = [{ to: '/', label: 'Converter' }];

const NEXT_THEME: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
const THEME_ICON = { system: Monitor, light: Sun, dark: Moon };

function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const Icon = THEME_ICON[theme];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Theme: ${theme}`} onClick={() => setTheme(NEXT_THEME[theme])}>
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Theme: {theme}</TooltipContent>
    </Tooltip>
  );
}

export function Layout() {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex min-h-svh flex-col">
        <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
            <NavLink to="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Route className="size-4" />
              </span>
              GPX Tools
            </NavLink>
            {NAV.length > 1 && (
              <nav className="flex items-center gap-4 text-sm">
                {NAV.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end
                    className={({ isActive }) =>
                      cn('transition-colors hover:text-foreground', isActive ? 'text-foreground' : 'text-muted-foreground')
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            )}
            <div className="ml-auto">
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
          <Outlet />
        </main>

        <footer className="border-t">
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-5 text-xs text-muted-foreground sm:px-6">
            <ShieldCheck className="size-3.5" />
            Everything runs locally in your browser — your files are never uploaded.
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}
