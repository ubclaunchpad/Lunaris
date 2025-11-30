import { LoginForm } from "@/components/login-form";
import { GradientBackground } from "@/components/gradient-background";

export default function LoginPage() {
    return (
        <>
            <GradientBackground />
            <div className="relative z-0 flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
                <div className="w-full max-w-sm">
                    <LoginForm />
                </div>
            </div>
        </>
    );
}
