import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ThemeProviderProps } from 'next-themes';
import { useAuth } from '@/context/AuthContext';

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      storageKey="migrateos-theme"
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}

export function SessionThemeProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const storageKey = isAuthenticated && user
    ? `migrateos-theme-${user.id}`
    : 'migrateos-theme-guest';

  return (
    <ThemeProvider key={storageKey} storageKey={storageKey}>
      {children}
    </ThemeProvider>
  );
}
