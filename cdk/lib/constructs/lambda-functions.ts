import { Construct } from "constructs";
import { Code, Function, Runtime, FunctionProps } from "aws-cdk-lib/aws-lambda";
import { Duration } from "aws-cdk-lib";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import * as path from "path";


export interface LambdaFunctionsProps {
  runningInstancesTable: Table;
  runningStreamsTable: Table;
}

export class LambdaFunctions extends Construct {

  // API Lambda Functions
  public readonly deployInstanceFunction: Function;
  public readonly terminateInstanceFunction: Function;
  public readonly streamingLinkFunction: Function;

  // User Deploy EC2 Workflow Lambda Functions
  public readonly checkRunningStreamsFunction: Function;
  public readonly deployEC2Function: Function;
  public readonly updateRunningStreamsFunction: Function;

  // User Terminate EC2 Workflow Lambda Functions
  public readonly checkRunningStreamsTerminateFunction: Function;
  public readonly terminateEC2Function: Function;
  public readonly updateRunningStreamsTerminateFunction: Function;

  constructor(scope: Construct, id: string, props: LambdaFunctionsProps) {
    super(scope, id);

    // Create API Lambda functions
    this.deployInstanceFunction = this.createDeployInstanceFunction(props);
    this.terminateInstanceFunction =
      this.createTerminateInstanceFunction(props);
    this.streamingLinkFunction = this.createStreamingLinkFunction(props);

    // Create User Deploy EC2 Workflow Lambda functions
    this.checkRunningStreamsFunction = this.createCheckRunningStreamsFunction(props);
    this.deployEC2Function = this.createDeployEC2Function(props);
    this.updateRunningStreamsFunction = this.createUpdateRunningStreamsFunction(props);

    // Create User Terminate EC2 Workflow Lambda functions
    this.checkRunningStreamsTerminateFunction = this.createCheckRunningStreamsTerminateFunction(props);
    this.terminateEC2Function = this.createTerminateEC2Function(props);
    this.updateRunningStreamsTerminateFunction = this.createUpdateRunningStreamsTerminateFunction(props);
  }

  // Creates the Lambda function for deploying EC2 instances
  private createDeployInstanceFunction(props: LambdaFunctionsProps): Function {
    return new Function(this, "DeployInstanceHandler", {
      ...this.getBaseLambdaConfig(),
      handler: "handlers/deployInstance.handler",
      description: "Deploys EC2 instances for cloud gaming sessions",
      timeout: Duration.seconds(60),
      environment: {
        RUNNING_INSTANCES_TABLE: props.runningInstancesTable.tableName,
      },
    });
  }

  // Creates the Lambda function for terminating EC2 instances
  private createTerminateInstanceFunction(
    props: LambdaFunctionsProps
  ): Function {
    return new Function(this, "TerminateInstanceHandler", {
      ...this.getBaseLambdaConfig(),
      handler: "handlers/terminateInstance.handler",
      description: "Terminates EC2 instances and cleans up resources",
      environment: {
        RUNNING_INSTANCES_TABLE: props.runningInstancesTable.tableName,
      },
    });
  }

  // Creates the Lambda function for generating streaming links
  private createStreamingLinkFunction(props: LambdaFunctionsProps): Function {
    return new Function(this, "StreamingLinkHandler", {
      ...this.getBaseLambdaConfig(),
      handler: "handlers/streamingLink.handler",
      description: "Generates streaming links for active gaming sessions",
      environment: {
        RUNNING_INSTANCES_TABLE: props.runningInstancesTable.tableName,
        RUNNING_STREAMS_TABLE: props.runningStreamsTable.tableName,
      },
    });
  }

  // Creates the Lambda function for checking running streams
  private createCheckRunningStreamsFunction(
    props: LambdaFunctionsProps
  ): Function {
    return new Function(this, "CheckRunningStreamsHandler", {
      ...this.getBaseLambdaConfig(),
      handler: "handlers/user-deploy-ec2/check-running-streams.handler",
      description: "Checks if user has active streaming sessions",
      environment: {
        RUNNING_STREAMS_TABLE: props.runningStreamsTable.tableName,
      },
    });
  }

  // Creates the Lambda function for deploying EC2 instances
  private createDeployEC2Function(props: LambdaFunctionsProps): Function {
    return new Function(this, "DeployEC2Handler", {
      ...this.getBaseLambdaConfig(),
      handler: "handlers/user-deploy-ec2/deploy-ec2.handler",
      description: "Deploys EC2 instance as part of user deployment workflow",
      environment: {
        RUNNING_INSTANCES_TABLE: props.runningInstancesTable.tableName,
      },
    });
  }

  // Creates the Lambda function for updating running streams
  private createUpdateRunningStreamsFunction(
    props: LambdaFunctionsProps
  ): Function {
    return new Function(this, "UpdateRunningStreamsHandler", {
      ...this.getBaseLambdaConfig(),
      handler: "handlers/user-deploy-ec2/update-running-streams.handler",
      description: "Updates running streams table with new session information",
      environment: {
        RUNNING_STREAMS_TABLE: props.runningStreamsTable.tableName,
      },
    });
  }

  // Creates the Lambda function for checking running streams (Terminate workflow)
  private createCheckRunningStreamsTerminateFunction(
    props: LambdaFunctionsProps
  ): Function {
    return new Function(this, "CheckRunningStreamsTerminateHandler", {
      ...this.getBaseLambdaConfig(),
      handler: "handlers/user-terminate-ec2/check-running-streams.handler",
      description: "Checks if user has active streaming sessions for termination",
      environment: {
        RUNNING_STREAMS_TABLE: props.runningStreamsTable.tableName,
      },
    });
  }

  // Creates the Lambda function for terminating EC2 instances
  private createTerminateEC2Function(props: LambdaFunctionsProps): Function {
    return new Function(this, "TerminateEC2Handler", {
      ...this.getBaseLambdaConfig(),
      handler: "handlers/user-terminate-ec2/terminate-ec2.handler",
      description: "Terminates EC2 instance as part of user termination workflow",
      environment: {
        RUNNING_INSTANCES_TABLE: props.runningInstancesTable.tableName,
      },
    });
  }

  // Creates the Lambda function for updating running streams (Terminate workflow)
  private createUpdateRunningStreamsTerminateFunction(
    props: LambdaFunctionsProps
  ): Function {
    return new Function(this, "UpdateRunningStreamsTerminateHandler", {
      ...this.getBaseLambdaConfig(),
      handler: "handlers/user-terminate-ec2/update-running-streams.handler",
      description: "Updates running streams table to mark session as terminated",
      environment: {
        RUNNING_STREAMS_TABLE: props.runningStreamsTable.tableName,
      },
    });
  }

  // Returns the base configuration shared by all Lambda functions
  private getBaseLambdaConfig(): Pick<
    FunctionProps,
    "runtime" | "code" | "timeout" | "memorySize"
  > {
    return {
      runtime: Runtime.NODEJS_22_X,
      // code: Code.fromAsset("stepfunctions/example-workflow/lambdas"),
       code: Code.fromAsset(path.join(__dirname, "../../../../lambda/dist")),
    };
  }
}
