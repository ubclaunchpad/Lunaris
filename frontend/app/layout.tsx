import type { Metadata } from "next";
import { Space_Grotesk, Sora } from "next/font/google";
import "./globals.css";
import { UserProvider } from "@/context/usercontext";
import { Navbar } from "@/components/navbar";
import { GradientBackground } from "@/components/gradient-background";

const spaceGrotesk = Space_Grotesk({
    variable: "--font-space-grotesk",
    subsets: ["latin"],
    weight: ["300", "400", "500", "600", "700"],
});

const sora = Sora({
    variable: "--font-sora",
    subsets: ["latin"],
    weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
    title: "Lunaris",
    description: "Cloud gaming platform - play games in your own pace",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className={`${spaceGrotesk.variable} ${sora.variable} antialiased font-sans`}>
                <UserProvider>
                    <>
                        <GradientBackground />
                        <div className="relative z-0">
                            <Navbar />
                            {children}
                        </div>
                    </>
                </UserProvider>
            </body>
        </html>
    );
}
