import type { Metadata } from "next";
import { Space_Grotesk, Sora } from "next/font/google";
import "./globals.css";
import { UserProvider } from "@/context/usercontext";
import { Navbar } from "@/components/navbar";

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
            <body
                className={`${spaceGrotesk.variable} ${sora.variable} antialiased font-sans bg-[#040609] text-[#fbfff5] min-h-screen`}
            >
                <UserProvider>
                    <Navbar />
                    <main className="relative z-0 min-h-screen pt-40 px-[58px]">
                        <div
                            className="pointer-events-none fixed inset-0 -z-10"
                            aria-hidden="true"
                            style={{
                                backgroundColor: "#0a0e12",
                                backgroundImage:
                                    "radial-gradient(ellipse 900px 900px at 80% 10%, rgba(113, 183, 206, 0.3) 0%, transparent 70%)," +
                                    "radial-gradient(ellipse 1000px 1000px at 10% 90%, rgba(230, 218, 246, 0.25) 0%, transparent 75%)",
                                backgroundAttachment: "fixed",
                            }}
                        />
                        {children}
                    </main>
                </UserProvider>
            </body>
        </html>
    );
}
