import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Intel Facial — 42 BPM",
  description: "Sistema de reconhecimento facial investigativo",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-gray-950 text-gray-100 antialiased">{children}</body>
    </html>
  );
}
