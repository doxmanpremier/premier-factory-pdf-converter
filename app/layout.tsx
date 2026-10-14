import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Premier Convertor/PM Tool",
  description: "Convert Cline's, Halton, and Low Temp Industries factory quote PDFs into AutoQuotes-ready files.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
