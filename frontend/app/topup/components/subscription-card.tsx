import { Button } from "@/components/ui/button";
import Image from "next/image";

interface SubscriptionCardProps {
    title: string;
    subtitle: string;
    price: string;
    priceUnit: string;
    features: string[];
    buttonText: string;
}

export function SubscriptionCard({
    title,
    subtitle,
    price,
    priceUnit,
    features,
    buttonText,
}: SubscriptionCardProps) {
    return (
        <div className="relative overflow-hidden rounded-2xl backdrop-blur-[2px] border border-[rgba(157,180,171,0.5)] shadow-[8px_7px_10px_0px_rgba(0,0,0,0.24)] bg-gradient-to-br from-[rgba(225,255,154,0.2)] to-[rgba(18,25,29,0.3)] p-8">
            <div className="mb-12">
                <h3 className="text-white">
                    <span className="text-2xl font-semibold font-sora">{title}</span>
                    <span className="font-normal text-base ml-2 font-space-grotesk">
                        {subtitle}
                    </span>
                </h3>
            </div>

            <div className="space-y-4 mb-8">
                {features.map((feature, index) => (
                    <div key={index} className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-6 h-6">
                            <Image src="/support.svg" alt="Feature icon" width={24} height={24} />
                        </div>
                        <span className="text-white text-sm font-normal font-space-grotesk">
                            {feature}
                        </span>
                    </div>
                ))}
            </div>

            <div
                className="rounded-2xl p-4 backdrop-blur-[2px] border shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)]
                bg-gradient-to-r from-[rgba(225,255,154,0.3)] to-[rgba(18,25,29,0.3)]"
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-baseline gap-1">
                        <span className="text-white text-2xl font-semibold font-sora">{price}</span>
                        <span className="text-white text-base font-normal font-space-grotesk">
                            {priceUnit}
                        </span>
                    </div>
                    <Button
                        className="rounded-2xl px-4 py-2 font-normal text-lg border bg-[rgba(230,218,246,0.1)] border-[#e1ff9a] text-[#fbfff5] hover:bg-[rgba(230,218,246,0.2)] font-space-grotesk"
                        variant="outline"
                    >
                        {buttonText}
                    </Button>
                </div>
            </div>
        </div>
    );
}
