import type { Metadata } from 'next';
import { ColorSchemeScript, createTheme, MantineProvider, mantineHtmlProps } from '@mantine/core';
import '@fontsource-variable/plus-jakarta-sans';
import '@mantine/core/styles.layer.css';
import '@mantine/dates/styles.layer.css';
import './globals.css';
// These global styles build on one another; keep their cascade order.
import './earlier-layouts.css';
import './app.css';
import './forms.css';
import './list-refinements.css';
import './interface-refinements.css';

const theme = createTheme({ fontFamily: '"Plus Jakarta Sans Variable", ui-sans-serif, system-ui, sans-serif' });

export const metadata: Metadata = {
  title: 'Pocket Buddy',
  description: 'Track income, expenses, and budgets.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" {...mantineHtmlProps}><head><ColorSchemeScript forceColorScheme="dark" /></head><body><MantineProvider theme={theme} forceColorScheme="dark">{children}</MantineProvider></body></html>;
}
