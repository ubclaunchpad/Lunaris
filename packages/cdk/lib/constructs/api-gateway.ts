import { Construct } from "constructs";
import { LambdaRestApi, LambdaIntegration  } from "aws-cdk-lib/aws-apigateway";
import { Function } from "aws-cdk-lib/aws-lambda";

export interface ApiGatewayProps {
  helloFunction: Function;
  deployInstanceFunction: Function;
  terminateInstanceFunction: Function;
  streamingLinkFunction: Function;
}

export class ApiGateway extends Construct {
  public readonly restApi: LambdaRestApi;

  constructor(scope: Construct, id: string, props: ApiGatewayProps) {
    super(scope, id);

    // API Gateway REST API resource backed by the hello function
    this.restApi = new LambdaRestApi(this, "Endpoint", {
      handler: props.helloFunction,
      proxy: false
    });

    const deployInstanceIntegration = new LambdaIntegration(props.deployInstanceFunction)
    const deployInstanceResource = this.restApi.root.addResource("deployInstance")
    deployInstanceResource.addMethod("POST", deployInstanceIntegration)

    // Define the /terminateInstance endpoint and associate it with the terminateInstanceFunction
    const terminateInstanceIntegration = new LambdaIntegration(props.terminateInstanceFunction);
    const terminateInstanceResource = this.restApi.root.addResource("terminateInstance")
    terminateInstanceResource.addMethod("POST", terminateInstanceIntegration)

    // Define the /streamingLink endpoint and associate it with the streamingLinkFunction
    const streamingLinkIntegration = new LambdaIntegration(props.streamingLinkFunction);
    const streamingLinkResource = this.restApi.root.addResource("streamingLink");
    streamingLinkResource.addMethod("GET", streamingLinkIntegration, {
      requestParameters: {
        "method.request.querystring.userId": true,
      },
    });
  }
}
