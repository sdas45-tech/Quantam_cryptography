import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BB84 Quantum Cryptography & Messenger Simulator",
  description: "An interactive quantum cryptography simulator demonstrating the BB84 protocol. Generate secure keys, visualize eavesdropping detection (QBER), and encrypt/decrypt messages with XOR OTP.",
  authors: [{ name: "Quantum Cryptography Lab" }],
  keywords: ["Quantum Cryptography", "BB84 Protocol", "Quantum Key Distribution", "QKD Simulation", "XOR Encryption"],
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
