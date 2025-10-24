import { Construct } from "constructs";
import { StateMachine, DefinitionBody } from "aws-cdk-lib/aws-stepfunctions";
import { Function } from "aws-cdk-lib/aws-lambda";
import * as fs from "fs";
import * as path from "path";

export interface StepFunctionsProps {
  greetingHandler: Function;
  responseHandler: Function;
  checkRunningStreams: Function;
  deployEC2: Function;
  updateRunningStreams: Function;
}

export class StepFunctions extends Construct {
  public readonly greetingWorkflow: StateMachine;
  public readonly userDeployEC2Workflow: StateMachine;

  constructor(scope: Construct, id: string, props: StepFunctionsProps) {
    super(scope, id);

    // Load and process the Step Function definition
    const definitionPath = path.join(
      __dirname,
      "../../stepfunctions/example-workflow/definition.asl.json"
    );
    const definitionTemplate = fs.readFileSync(definitionPath, "utf8");

    // Replace placeholders with actual Lambda ARNs
    const definition = definitionTemplate
      .replace("${GreetingHandlerArn}", props.greetingHandler.functionArn)
      .replace("${ResponseHandlerArn}", props.responseHandler.functionArn);

    // Create the Step Function
    this.greetingWorkflow = new StateMachine(this, "GreetingWorkflow", {
      definitionBody: DefinitionBody.fromString(definition),
    });

    // Grant Step Function permission to invoke the Lambda functions
    props.greetingHandler.grantInvoke(this.greetingWorkflow);
    props.responseHandler.grantInvoke(this.greetingWorkflow);

    // UserDeployEC2 Step Function
    const userDeployDefinitionPath = path.join(
      __dirname,
      "../../stepfunctions/user-deploy-ec2/definition.asl.json"
    );
    const userDeployDefinitionTemplate = fs.readFileSync(userDeployDefinitionPath, "utf8");

    const userDeployDefinition = userDeployDefinitionTemplate
      .replace("${CheckRunningStreamsArn}", props.checkRunningStreams.functionArn)
      .replace("${DeployEC2Arn}", props.deployEC2.functionArn)
      .replace("${UpdateRunningStreamsArn}", props.updateRunningStreams.functionArn);

    this.userDeployEC2Workflow = new StateMachine(this, "UserDeployEC2Workflow", {
      definitionBody: DefinitionBody.fromString(userDeployDefinition),
    });

    props.checkRunningStreams.grantInvoke(this.userDeployEC2Workflow);
    props.deployEC2.grantInvoke(this.userDeployEC2Workflow);
    props.updateRunningStreams.grantInvoke(this.userDeployEC2Workflow);
  }
}
