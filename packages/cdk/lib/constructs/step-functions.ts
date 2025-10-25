import { Construct } from "constructs";
import { StateMachine, DefinitionBody } from "aws-cdk-lib/aws-stepfunctions";
import { Function } from "aws-cdk-lib/aws-lambda";
import * as fs from "fs";
import * as path from "path";

export interface StepFunctionsProps {
  greetingHandler: Function;
  responseHandler: Function;
}

export class StepFunctions extends Construct {
  public readonly greetingWorkflow: StateMachine;

  constructor(scope: Construct, id: string, props: StepFunctionsProps) {
    super(scope, id);

    // Load and process the Step Function definition
    const definitionPath = path.join(process.cwd(), "../../stepfunctions/example-workflow/definition.asl.json");
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
  }
}