"use client";

import { PageHeader, PricingCard, SubscriptionCard } from "./components";

export default function TopUpPage() {
    return (
        <main className="pt-40 px-8">
                <div className="max-w-7xl mx-auto">
                    <PageHeader />

                    <div className="flex gap-14 justify-center items-start">
                        <div className="grid grid-cols-2 gap-6 w-[660px]">
                            <PricingCard
                                minutes="60"
                                price="$0"
                                badge="New Player Award"
                                buttonText="Free Claim"
                            />

                            <PricingCard
                                minutes="120"
                                minorMinutes="20"
                                price="$12"
                                originalPrice="$18"
                                badge="Bonus 25 minutes"
                                isHighlight
                                buttonText="Claim"
                            />

                            <PricingCard
                                minutes="240"
                                minorMinutes="50"
                                price="$12"
                                badge="Bonus 25 minutes"
                                buttonText="Claim"
                            />

                            <PricingCard
                                minutes="480"
                                minorMinutes="100"
                                price="$12"
                                badge="Bonus 25 minutes"
                                buttonText="Claim"
                            />
                        </div>

                        <div className="w-80">
                            <SubscriptionCard
                                title="Flexible"
                                subtitle="Auto Replenish"
                                price="$0.10"
                                priceUnit="/minute"
                                features={[
                                    "15% OFF every play",
                                    "Flexible Time Amount",
                                    "Worry free game play",
                                    "Play before Pay",
                                    "Weekly billing plan",
                                ]}
                                buttonText="Set Up"
                            />
                        </div>
                    </div>
                </div>
            </main>
    );
}