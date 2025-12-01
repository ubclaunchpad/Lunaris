import { NextResponse } from "next/server";
import {
    CognitoIdentityProviderClient,
    SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";

export async function POST(req: Request) {
    const { username, email, password } = await req.json();   // <-- accept username + email

    try {
        const client = new CognitoIdentityProviderClient({
            region: process.env.NEXT_PUBLIC_COGNITO_REGION,
        });

        const command = new SignUpCommand({
            ClientId: process.env.COGNITO_CLIENT_ID!,  // your client ID
            Username: username,                        // <-- username is NOT email
            Password: password,

            // Email must always be provided because your pool requires it
            UserAttributes: [
                {
                    Name: "email",
                    Value: email,
                },
            ],
        });

        const response = await client.send(command);

        return NextResponse.json({ success: true, response });

    } catch (err: unknown) {
        console.error("Signup error:", err);

        const message = err instanceof Error ? err.message : "Unknown error";

        return NextResponse.json(
            { success: false, message },
            { status: 400 }
        );
    }
}
