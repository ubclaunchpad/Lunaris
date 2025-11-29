import { NextResponse } from "next/server";
import {
    CognitoIdentityProviderClient,
    SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";

export async function POST(req: Request) {
    const { email, password } = await req.json();

    try {
        const client = new CognitoIdentityProviderClient({
            region: process.env.NEXT_PUBLIC_COGNITO_REGION,
        });

        const command = new SignUpCommand({
            ClientId: process.env.COGNITO_CLIENT_ID!,
            Username: email,
            Password: password,
            UserAttributes: [
                {
                    Name: "email",
                    Value: email,
                },
            ],
        });

        const response = await client.send(command);

        return NextResponse.json({ success: true, response });
    } catch (err: any) {
        console.error("Signup error:", err);
        return NextResponse.json({ success: false, message: err.message }, { status: 400 });
    }
}
