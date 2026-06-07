import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "@/context/AuthContext";
import { QueryProvider } from "@/context/QueryProvider";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SplitEase — Split expenses, not friendships",
  description: "Track shared expenses with friends and groups",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-950 text-slate-100 min-h-screen`}>
        <QueryProvider>
          <AuthProvider>
            {children}
            <Toaster
              position="top-right"
              toastOptions={{
                style: {
                  background: "#1e293b",
                  color: "#f1f5f9",
                  border: "1px solid #334155",
                  borderRadius: "10px",
                  fontSize: "14px",
                },
                success: { iconTheme: { primary: "#22c55e", secondary: "#1e293b" } },
                error:   { iconTheme: { primary: "#ef4444", secondary: "#1e293b" } },
              }}
            />
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
