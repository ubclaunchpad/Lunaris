/**
 * Gradient background component that matches the Figma design (Frame 69)
 * Applies a dark teal-to-dark gradient effect across the page
 */
export function GradientBackground() {
    return (
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
            <div
                className="absolute inset-0 bg-gradient-to-br from-[#1a3a3a] via-[#0d1f23] to-[#0a1114]"
                style={{
                    backgroundImage: `
                        radial-gradient(ellipse at 20% 50%, rgba(26, 58, 58, 0.8) 0%, transparent 50%),
                        radial-gradient(ellipse at 80% 80%, rgba(21, 50, 58, 0.6) 0%, transparent 50%),
                        linear-gradient(135deg, #1a3a3a 0%, #0a1114 100%)
                    `,
                }}
            />
        </div>
    );
}
