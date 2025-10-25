import { Construct } from "constructs";
import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";

export class LambdaFunctions extends Construct {
  public readonly helloFunction: Function;
  public readonly deployInstanceFunction: Function;
  public readonly greetingHandler: Function;
  public readonly responseHandler: Function;
  public readonly terminateInstanceFunction: Function;
  public readonly streamingLinkFunction: Function;

  // lambda functions for UserDeployEC2 step function
  public readonly checkRunningStreamsFunction: Function;
  public readonly deployEC2Function: Function;
  public readonly updateRunningStreamsFunction: Function;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // API Gateway Lambda
    this.helloFunction = new Function(this, "HelloHandler", {
      runtime: Runtime.NODEJS_22_X,
      code: Code.fromAsset("lambda"),
      handler: "hello.handler",
    });

    this.deployInstanceFunction = new NodejsFunction(
      this,
      "DeployInstanceHandler",
      {
        entry: "lambda/deployInstance.ts",
        runtime: Runtime.NODEJS_22_X,
      }
    );

    // Step Function Lambda handlers
    this.greetingHandler = new Function(this, "GreetingHandler", {
      runtime: Runtime.NODEJS_22_X,
      code: Code.fromAsset("stepfunctions/example-workflow/lambdas"),
      handler: "greeting-handler.handler",
    });

    this.responseHandler = new Function(this, "ResponseHandler", {
      runtime: Runtime.NODEJS_22_X,
      code: Code.fromAsset("stepfunctions/example-workflow/lambdas"),
      handler: "response-handler.handler",
    });

    // Terminate Instance Lambda
    this.terminateInstanceFunction = new Function(
      this,
      "TerminateInstanceHandler",
      {
        runtime: Runtime.NODEJS_22_X,
        code: Code.fromAsset("lambda"),
        handler: "terminateInstance.handler",
      }
    );

    // Streaming Link Lambda
    this.streamingLinkFunction = new Function(this, "StreamingLinkFunction", {
      runtime: Runtime.NODEJS_22_X,
      code: Code.fromAsset("lambda"),
      handler: "streamingLink.handler",
    });

    // UserDeployEC2 step function lambdas
    this.checkRunningStreamsFunction = new NodejsFunction(
      this,
      "CheckRunningStreamsHandler",
      {
        runtime: Runtime.NODEJS_22_X,
        entry: "lambda/check-running-streams.ts",
        environment: {
          RUNNING_STREAMS_TABLE_NAME: "RunningStreams",
        },
      }
    );

    this.deployEC2Function = new NodejsFunction(this, "DeployEC2Handler", {
      runtime: Runtime.NODEJS_22_X,
      entry: "lambda/deploy-ec2.ts",
    });

    this.updateRunningStreamsFunction = new NodejsFunction(
      this,
      "UpdateRunningStreamsHandler",
      {
        runtime: Runtime.NODEJS_22_X,
        entry: "lambda/update-running-streams.ts",
        environment: {
          RUNNING_STREAMS_TABLE_NAME: "RunningStreams",
        },
      }
    );
  }
}
