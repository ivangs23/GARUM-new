import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { CartProvider } from "@/context/CartContext";
import "./globals.css";

const inter = Inter({ 
  variable: "--font-inter",
  subsets: ["latin"] 
});

const playfair = Playfair_Display({ 
  variable: "--font-playfair",
  subsets: ["latin"] 
});

export const metadata: Metadata = {
  title: "Garum | Vinoteca & Cafetería",
  description: "Pedidos en mesa y pago online de forma sencilla y elegante.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${inter.variable} ${playfair.variable}`}>
      <body>
        <CartProvider>
          {children}
        </CartProvider>
      </body>
    </html>
  );
}
