"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

export function Navbar() {
    const pathname = usePathname();

    const isActive = (path: string) => pathname === path;

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 bg-[rgba(251,255,245,0.05)] backdrop-blur-sm border-b border-[rgba(255,255,255,0.1)] shadow-[0px_5px_20px_0px_rgba(0,0,0,0.1)]">
            <div className="flex items-center justify-between px-7 py-6 max-w-full">
                <div className="flex items-center gap-11">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-[#e1ff9a] rounded-full flex items-center justify-center">
                            <span className="text-[#12191d] font-bold text-lg">L</span>
                        </div>
                        <span className="text-[#fbfff5] font-bold text-2xl font-space-grotesk">Lunaris</span>
                    </div>

                    <div className="flex items-center gap-11">
                        <Link
                            href="/"
                            className={`text-lg font-normal font-space-grotesk transition-colors ${
                                isActive("/") ? "text-[#fbfff5]" : "text-[#fbfff5] hover:text-[#e1ff9a]"
                            }`}
                        >
                            Home
                        </Link>
                        <Link
                            href="/browse"
                            className={`text-lg font-normal font-space-grotesk transition-colors ${
                                isActive("/browse") ? "text-[#fbfff5]" : "text-[#fbfff5] hover:text-[#e1ff9a]"
                            }`}
                        >
                            My Games
                        </Link>
                        <Link
                            href="/topup"
                            className={`text-lg font-normal font-space-grotesk transition-colors ${
                                isActive("/topup") ? "text-[#e1ff9a]" : "text-[#fbfff5] hover:text-[#e1ff9a]"
                            }`}
                        >
                            Top-Up
                        </Link>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="text-[#fbfff5] hover:text-[#e1ff9a] border border-[#fbfff5] rounded-full"
                    >
                        <svg
                            className="w-6 h-6"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                            />
                        </svg>
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="text-[#fbfff5] hover:text-[#e1ff9a] border border-[#fbfff5] rounded-full"
                    >
                        <svg
                            className="w-6 h-6"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                            />
                        </svg>
                    </Button>
                </div>
            </div>
        </nav>
    );
}
