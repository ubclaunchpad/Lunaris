import { Button } from "@/components/ui/button";
import Image from "next/image";

interface PricingCardProps {
    minutes: string;
    minorMinutes?: string;
    price: string;
    originalPrice?: string;
    badge: string;
    isHighlight?: boolean;
    buttonText: string;
}

export function PricingCard({
    minutes,
    minorMinutes,
    price,
    originalPrice,
    badge,
    isHighlight = false,
    buttonText,
}: PricingCardProps) {
    return (
        <div
            className={`relative overflow-hidden rounded-2xl p-6 backdrop-blur-[2px] border border-[rgba(157,180,171,0.5)] shadow-[8px_7px_10px_0px_rgba(0,0,0,0.24)] ${
                isHighlight
                    ? "bg-gradient-to-br from-[rgba(225,255,154,0.3)] to-[rgba(18,25,29,0.3)]"
                    : "bg-gradient-to-br from-[rgba(230,218,246,0.2)] to-[rgba(18,25,29,0.3)]"
            }`}
        >
            <div className="mb-4 flex items-center gap-2">
                <div className="flex-shrink-0 w-6 h-6">
                    <Image src="/support.svg" alt="Support icon" width={24} height={24} />
                </div>
                <span className="text-xs font-normal text-[#fbfff5] font-sora">{badge}</span>
            </div>

            <div className="mb-8">
                <div className="text-white text-3xl font-semibold font-sora">
                    {minutes}
                    {minorMinutes && (
                        <>
                            {" "}
                            <span className="text-2xl">+{minorMinutes}</span>
                        </>
                    )}
                    <span className="text-base font-normal ml-2 font-space-grotesk">minutes</span>
                </div>
            </div>

            <div
                className={`rounded-2xl p-4 mb-4 backdrop-blur-[2px] border border-[rgba(157,180,171,0.5)] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] ${
                    isHighlight
                        ? "bg-gradient-to-r from-[rgba(225,255,154,0.3)] to-[rgba(18,25,29,0.3)]"
                        : "bg-gradient-to-r from-[rgba(230,218,246,0.3)] to-[rgba(18,25,29,0.3)]"
                }`}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-baseline gap-2">
                        <span className="text-white text-3xl font-semibold font-sora">{price}</span>
                        {originalPrice && (
                            <span className="text-white text-lg line-through opacity-60 font-sora">
                                {originalPrice}
                            </span>
                        )}
                    </div>
                    <Button
                        className={`rounded-2xl px-4 py-2 font-normal text-lg border bg-[rgba(230,218,246,0.1)] border-[#e1ff9a] text-[#fbfff5] hover:bg-[rgba(230,218,246,0.2)] font-space-grotesk ${
                            isHighlight ? "" : ""
                        }`}
                    >
                        {buttonText}
                    </Button>
                </div>
            </div>
        </div>
    );
}
