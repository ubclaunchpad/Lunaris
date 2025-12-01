import { NextResponse } from "next/server";
import {
    CognitoIdentityProviderClient,
    InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";

export async function POST(req: Request) {
    const { username, password } = await req.json();   // <-- important change

    try {
        const client = new CognitoIdentityProviderClient({
            region: process.env.NEXT_PUBLIC_COGNITO_REGION,
        });

        const command = new InitiateAuthCommand({
            AuthFlow: "USER_PASSWORD_AUTH",
            ClientId: process.env.COGNITO_CLIENT_ID!,
            AuthParameters: {
                USERNAME: username,    // <-- MUST use username, NOT email
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

    } catch (err: unknown) {

        const message =
            err instanceof Error
                ? err.message
                : "Unknown error";

        return NextResponse.json(
            { success: false, message },
            { status: 400 }
        );
    }
}
