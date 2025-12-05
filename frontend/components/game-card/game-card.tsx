"use client";

import { useState } from "react";
import Link from "next/link";

interface GameCardProps {
    id: string;
    src: string;
    alt?: string;
    title: string;
    modes: string[];
    tags: string[];
}

export function GameCard({ id, src, alt, title, modes, tags }: GameCardProps) {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <Link
            href={`/games/${id}`}
            className="relative shrink-0 w-96 h-44 group"
            style={{ zIndex: isHovered ? 100 : 50 }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Card */}
            <div
                className="transition-all duration-300"
                style={{
                    transform: isHovered ? "scale(1.05)" : "scale(1)",
                    transformOrigin: "center bottom",
                    boxShadow: isHovered ? "0px 20px 40px rgba(0, 0, 0, 0.3)" : "none",
                }}
            >
                <img src={src} alt={alt ?? title} className="w-full h-44 object-cover rounded-xs" />

                {/* Description panel */}
                <div
                    className="absolute left-0 right-0 top-full rounded-b-lg bg-[#0c1216]/95 backdrop-blur-sm border border-white/10 shadow-[0_12px_30px_rgba(0,0,0,0.45)]"
                    style={{
                        opacity: isHovered ? 1 : 0,
                        visibility: isHovered ? "visible" : "hidden",
                        zIndex: 100,
                        transition: "opacity 350ms ease, visibility 350ms",
                        borderTop: "none",
                    }}
                >
                    <div className="p-4 space-y-3">
                        <h3 className="text-white font-space-grotesk font-medium text-base text-left">
                            {title}
                        </h3>

                        <div className="flex items-center text-xs text-[#fbfff5] flex-wrap">
                            {modes.map((mode, idx) => (
                                <span key={idx} className="flex items-center">
                                    {mode}
                                    {idx < modes.length - 1 && <span className="mx-2">•</span>}
                                </span>
                            ))}
                        </div>

                        <div className="flex gap-2 flex-wrap">
                            {tags.map((tag, idx) => (
                                <span
                                    key={idx}
                                    className="text-xs border border-[#e6daf6] text-[#e6daf6] px-2 py-1 rounded-lg"
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </Link>
    );
}
