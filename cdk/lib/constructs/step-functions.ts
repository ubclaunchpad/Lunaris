import { Construct } from "constructs";
import { StateMachine } from "aws-cdk-lib/aws-stepfunctions";
import { Function } from "aws-cdk-lib/aws-lambda";
import { WorkflowFactory } from "./workflow-factory";
import { WorkflowRegistry } from "../workflows";

export interface StepFunctionsProps extends Record<string, Function> {
    readonly checkRunningStreamsFunction: Function;
    readonly deployEC2Function: Function;
    readonly updateRunningStreamsFunction: Function;
    readonly checkRunningStreamsTerminateFunction: Function;
    readonly terminateEC2Function: Function;
    readonly updateRunningStreamsTerminateFunction: Function;
}

export class StepFunctions extends Construct {
    private workflows: Map<string, StateMachine> = new Map();
    private workflowFactory: WorkflowFactory;

    constructor(scope: Construct, id: string, props: StepFunctionsProps) {
        super(scope, id);

        this.workflowFactory = new WorkflowFactory(this, "WorkflowFactory");

        // Discover and register all workflows
        WorkflowRegistry.discoverWorkflows();

        // Create all registered workflows with Lambda function mappings
        this.createWorkflows(props);
    }

    /**
     * Creates all registered workflows using the WorkflowFactory
     */
    private createWorkflows(props: StepFunctionsProps): void {
        const allWorkflows = WorkflowRegistry.getAllWorkflows();

        allWorkflows.forEach((config) => {
            try {
                const workflow = this.workflowFactory.createWorkflow(config, props);
                this.workflows.set(config.name, workflow);
            } catch (error) {
                console.warn(`Failed to create workflow '${config.name}':`, error);
            }
        });
    }

    /**
     * Get a workflow by name
     * @param name The name of the workflow to retrieve
     * @returns The StateMachine instance or undefined if not found
     */
    public getWorkflow(name: string): StateMachine | undefined {
        return this.workflows.get(name);
    }

    /**
     * Get all created workflows
     * @returns Array of all created StateMachine instances
     */
    public getAllWorkflows(): StateMachine[] {
        return Array.from(this.workflows.values());
    }

    /**
     * Get all workflow names
     * @returns Array of all workflow names
     */
    public getWorkflowNames(): string[] {
        return Array.from(this.workflows.keys());
    }
}
