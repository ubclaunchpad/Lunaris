import { Construct } from "constructs";
import {
  LambdaRestApi,
  LambdaIntegration,
  Resource,
} from "aws-cdk-lib/aws-apigateway";
import { Function } from "aws-cdk-lib/aws-lambda";

export interface ApiGatewayProps {
  deployInstanceFunction: Function;
  terminateInstanceFunction: Function;
  streamingLinkFunction: Function;
}

export class ApiGateway extends Construct {
  public readonly restApi: LambdaRestApi;

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
