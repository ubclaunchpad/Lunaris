import Link from "next/link";
import { GradientBackground } from "@/components/gradient-background";

export default function Home() {
    return (
        <>
            <GradientBackground />
            <div className="relative z-0 min-h-screen flex items-center justify-center">
                <Link href={"login"} className="text-[#e1ff9a] hover:text-white transition-colors text-lg font-space-grotesk">
                    Log In
                </Link>
            </div>
        </>
    );
}
