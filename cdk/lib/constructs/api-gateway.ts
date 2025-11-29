import { Construct } from "constructs";
import { LambdaRestApi, LambdaIntegration, type IRestApi } from "aws-cdk-lib/aws-apigateway";
import { Function } from "aws-cdk-lib/aws-lambda";

export interface ApiGatewayProps {
    readonly deployInstanceFunction: Function;
    readonly terminateInstanceFunction: Function;
    readonly streamingLinkFunction: Function;
}

export class ApiGateway extends Construct {
    public readonly restApi: IRestApi;

    constructor(scope: Construct, id: string, props: ApiGatewayProps) {
        super(scope, id);

        this.restApi = new LambdaRestApi(this, "LunarisApi", {
            handler: props.deployInstanceFunction,
            proxy: false,
            description: "LunarisAPI",
        });

        // Add API endpoints to LunarisApi here
        this.createDeployInstanceEndpoint(props.deployInstanceFunction);
        this.createTerminateInstanceEndpoint(props.terminateInstanceFunction);
        this.createStreamingLinkEndpoint(props.streamingLinkFunction);
    }

    private createDeployInstanceEndpoint(lambdaFunction: Function): void {
        const integration = new LambdaIntegration(lambdaFunction);
        const resource = this.restApi.root.addResource("deployInstance");

        resource.addMethod("POST", integration, {
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
        });
    }

    /**
     * Creates the terminate instance API endpoint
     * The Lambda handler validates input, invokes the Step Function, and stores execution ARN
     * @param lambdaFunction The terminateInstance Lambda function
     */
    private createTerminateInstanceEndpoint(lambdaFunction: Function): void {
        const integration = new LambdaIntegration(lambdaFunction);
        const resource = this.restApi.root.addResource("terminateInstance");

        resource.addMethod("POST", integration, {
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
                    statusCode: "500",
                    responseModels: {
                        "application/json": { modelId: "Error" },
                    },
                },
            ],
        });
    }

    private createStreamingLinkEndpoint(lambdaFunction: Function): void {
        const integration = new LambdaIntegration(lambdaFunction);
        const resource = this.restApi.root.addResource("streamingLink");

        resource.addMethod("GET", integration, {
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
        });
    }
}
