import { Construct } from "constructs";
import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";

export class LambdaFunctions extends Construct {
  public readonly helloFunction: Function;
  public readonly deployInstanceFunction: Function;
  public readonly greetingHandler: Function;
  public readonly responseHandler: Function;
  public readonly terminateInstanceFunction: Function;
  public readonly streamingLinkFunction: Function;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // API Gateway Lambda
    this.helloFunction = new Function(this, "HelloHandler", {
      runtime: Runtime.NODEJS_22_X,
      code: Code.fromAsset("../../lambda"),
      handler: "hello.handler",
    });

    this.deployInstanceFunction = new Function(this, "DeployInstanceHandler", {
      runtime: Runtime.NODEJS_22_X,
      code: Code.fromAsset("../../lambda"),
      handler: "deployInstance.handler",
    });

    // Step Function Lambda handlers
    this.greetingHandler = new Function(this, "GreetingHandler", {
      runtime: Runtime.NODEJS_22_X,
      code: Code.fromAsset("../../stepfunctions/example-workflow/lambdas"),
      handler: "greeting-handler.handler",
    });

    this.responseHandler = new Function(this, "ResponseHandler", {
      runtime: Runtime.NODEJS_22_X,
      code: Code.fromAsset("../../stepfunctions/example-workflow/lambdas"),
      handler: "response-handler.handler",
    });

    // Terminate Instance Lambda
    this.terminateInstanceFunction = new Function(this, "TerminateInstanceHandler", {
      runtime: Runtime.NODEJS_22_X,
      code: Code.fromAsset("../../lambda"),
      handler: "terminateInstance.handler",
    });

    // Streaming Link Lambda
    this.streamingLinkFunction = new Function(this, "StreamingLinkFunction", {
      runtime: Runtime.NODEJS_22_X,
      code: Code.fromAsset("../../lambda"),
      handler: "streamingLink.handler", 
    });
  }
}
