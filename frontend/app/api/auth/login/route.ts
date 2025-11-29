import { NextResponse } from "next/server";
import {
    CognitoIdentityProviderClient,
    InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";

export async function POST(req: Request) {
    const { email, password } = await req.json();

    try {
        const client = new CognitoIdentityProviderClient({
            region: process.env.NEXT_PUBLIC_COGNITO_REGION,
        });

        const command = new InitiateAuthCommand({
            AuthFlow: "USER_PASSWORD_AUTH",
            ClientId: process.env.COGNITO_CLIENT_ID!,
            AuthParameters: {
                USERNAME: email,
                PASSWORD: password,
            },
        });

        const response = await client.send(command);
        const result = response.AuthenticationResult;

        return NextResponse.json({
            success: true,
            idToken: result?.IdToken,
            accessToken: result?.AccessToken,
            refreshToken: result?.RefreshToken,
        });
    } catch (err: any) {
        console.error("Cognito error:", err);
        return NextResponse.json({ success: false, message: err.message }, { status: 400 });
    }
}
