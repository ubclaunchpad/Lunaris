import { Construct } from "constructs";
import {
    LambdaRestApi,
    LambdaIntegration,
    CognitoUserPoolsAuthorizer,
    AuthorizationType,
} from "aws-cdk-lib/aws-apigateway";
import { Function } from "aws-cdk-lib/aws-lambda";
import * as cognito from "aws-cdk-lib/aws-cognito";

export interface ApiGatewayProps {
    apiFunction: Function;
    userPool?: cognito.UserPool;
}

export class ApiGateway extends Construct {
    public readonly restApi: LambdaRestApi;
    public readonly authorizer?: CognitoUserPoolsAuthorizer;

    constructor(scope: Construct, id: string, props: ApiGatewayProps) {
        super(scope, id);

        this.restApi = new LambdaRestApi(this, "LunarisApi", {
            handler: props.apiFunction,
            proxy: false,
            description: "LunarisAPI",
        });

        // Create Cognito Authorizer if User Pool is provided
        if (props.userPool) {
            this.authorizer = new CognitoUserPoolsAuthorizer(this, "LunarisApiAuthorizer", {
                cognitoUserPools: [props.userPool],
                authorizerName: "LunarisAuthorizer",
                identitySource: "method.request.header.Authorization",
            });
        }

        // Add API endpoints to LunarisApi here
        const integration = new LambdaIntegration(props.apiFunction);
        this.createDeployInstanceEndpoint(integration);
        this.createTerminateInstanceEndpoint(integration);
        this.createStreamingLinkEndpoint(integration);
    }

    private createDeployInstanceEndpoint(integration: LambdaIntegration): void {
        const resource = this.restApi.root.addResource("deployInstance");

        const methodOptions = this.authorizer
            ? {
                  authorizer: this.authorizer,
                  authorizationType: AuthorizationType.COGNITO,
                  methodResponses: [
                      {
                          statusCode: "200",
                          responseModels: {
                              "application/json": { modelId: "Empty" },
                          },
                      },
                      {
                          statusCode: "400",
                          responseModels: {
                              "application/json": { modelId: "Error" },
                          },
                      },
                      {
                          statusCode: "401",
                          responseModels: {
                              "application/json": { modelId: "Error" },
                          },
                      },
                  ],
              }
            : {
                  methodResponses: [
                      {
                          statusCode: "200",
                          responseModels: {
                              "application/json": { modelId: "Empty" },
                          },
                      },
                      {
                          statusCode: "400",
                          responseModels: {
                              "application/json": { modelId: "Error" },
                          },
                      },
                  ],
              };

        resource.addMethod("POST", integration, methodOptions);
    }

    private createTerminateInstanceEndpoint(integration: LambdaIntegration): void {
        const resource = this.restApi.root.addResource("terminateInstance");

        const methodOptions = this.authorizer
            ? {
                  authorizer: this.authorizer,
                  authorizationType: AuthorizationType.COGNITO,
                  methodResponses: [
                      {
                          statusCode: "200",
                          responseModels: {
                              "application/json": { modelId: "Empty" },
                          },
                      },
                      {
                          statusCode: "400",
                          responseModels: {
                              "application/json": { modelId: "Error" },
                          },
                      },
                      {
                          statusCode: "401",
                          responseModels: {
                              "application/json": { modelId: "Error" },
                          },
                      },
                  ],
              }
            : {
                  methodResponses: [
                      {
                          statusCode: "200",
                          responseModels: {
                              "application/json": { modelId: "Empty" },
                          },
                      },
                      {
                          statusCode: "400",
                          responseModels: {
                              "application/json": { modelId: "Error" },
                          },
                      },
                  ],
              };

        resource.addMethod("POST", integration, methodOptions);
    }

    private createStreamingLinkEndpoint(integration: LambdaIntegration): void {
        const resource = this.restApi.root.addResource("streamingLink");

        const methodOptions = this.authorizer
            ? {
                  authorizer: this.authorizer,
                  authorizationType: AuthorizationType.COGNITO,
                  requestParameters: {
                      "method.request.querystring.userId": false, // Optional since we get it from token
                  },
                  methodResponses: [
                      {
                          statusCode: "200",
                          responseModels: {
                              "application/json": { modelId: "Empty" },
                          },
                      },
                      {
                          statusCode: "400",
                          responseModels: {
                              "application/json": { modelId: "Error" },
                          },
                      },
                      {
                          statusCode: "401",
                          responseModels: {
                              "application/json": { modelId: "Error" },
                          },
                      },
                      {
                          statusCode: "404",
                          responseModels: {
                              "application/json": { modelId: "Error" },
                          },
                      },
                  ],
              }
            : {
                  requestParameters: {
                      "method.request.querystring.userId": true,
                  },
                  methodResponses: [
                      {
                          statusCode: "200",
                          responseModels: {
                              "application/json": { modelId: "Empty" },
                          },
                      },
                      {
                          statusCode: "400",
                          responseModels: {
                              "application/json": { modelId: "Error" },
                          },
                      },
                      {
                          statusCode: "404",
                          responseModels: {
                              "application/json": { modelId: "Error" },
                          },
                      },
                  ],
              };

        resource.addMethod("GET", integration, methodOptions);
    }
}
