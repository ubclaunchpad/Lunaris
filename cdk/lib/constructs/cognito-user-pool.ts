import { Construct } from "constructs";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Duration, RemovalPolicy, CfnOutput } from "aws-cdk-lib";

export class CognitoUserPool extends Construct {
    public readonly userPool: cognito.UserPool;
    public readonly userPoolClient: cognito.UserPoolClient;

    constructor(scope: Construct, id: string) {
        super(scope, id);

        // Create User Pool for user management
        this.userPool = new cognito.UserPool(this, "LunarisUserPool", {
            userPoolName: "lunaris-user-pool",
            featurePlan: cognito.FeaturePlan.LITE, // low level plan
            signInCaseSensitive: false,
            selfSignUpEnabled: true,
            signInAliases: {
                email: true,
                username: true,
            },
            autoVerify: {
                email: true,
            },
            keepOriginal: {
                email: true,
            },
            standardAttributes: {
                email: {
                    required: true,
                    mutable: true,
                },
            },
            passwordPolicy: {
                minLength: 8,
                requireLowercase: true,
                requireUppercase: true,
                requireDigits: true,
                requireSymbols: false,
            },
            accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
            removalPolicy: RemovalPolicy.DESTROY, // Use RETAIN in production
        });

        // Create App Client for frontend integration
        this.userPoolClient = new cognito.UserPoolClient(this, "LunarisUserPoolClient", {
            userPool: this.userPool,
            userPoolClientName: "lunaris-web-client",
            authFlows: {
                userPassword: true,
                userSrp: true,
            },
            generateSecret: false,
            accessTokenValidity: Duration.hours(1),
            idTokenValidity: Duration.hours(1),
            refreshTokenValidity: Duration.days(30),
            preventUserExistenceErrors: true,
        });

        // Output important values for frontend configuration
        new CfnOutput(this, "UserPoolId", {
            value: this.userPool.userPoolId,
            description: "Cognito User Pool ID",
            exportName: "LunarisUserPoolId",
        });

        new CfnOutput(this, "UserPoolClientId", {
            value: this.userPoolClient.userPoolClientId,
            description: "Cognito User Pool Client ID",
            exportName: "LunarisUserPoolClientId",
        });

        new CfnOutput(this, "UserPoolArn", {
            value: this.userPool.userPoolArn,
            description: "Cognito User Pool ARN",
            exportName: "LunarisUserPoolArn",
        });
    }
}
