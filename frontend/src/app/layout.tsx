import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BB84 Quantum Cryptography & Messenger Simulator",
  description: "Visualize quantum key exchange, secure documents in the file locker, and encrypt communications with XOR cryptography.",
  authors: [{ name: "Quantum Cryptography Lab" }],
  keywords: ["Quantum Cryptography", "BB84 Protocol", "Quantum Key Distribution", "QKD Simulation", "XOR Encryption"],
  manifest: "/manifest.json",
};

import Providers from "@/context/Providers";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
