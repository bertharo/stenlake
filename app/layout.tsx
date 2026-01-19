import type { Metadata } from "next";
import "./globals.css";
import Nav from "./components/nav";

export const metadata: Metadata = {
  title: "Roger — Running Coach",
  description: "Calm, intelligent running coach with contextual conversation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
