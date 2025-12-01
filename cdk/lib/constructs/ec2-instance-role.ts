import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cdk from "aws-cdk-lib";

/**
 * Creates an IAM role and instance profile for EC2 instances
 * that enables SSM access and other necessary permissions for DCV streaming
 */
export class EC2InstanceRole extends Construct {
    public readonly role: iam.Role;
    public readonly instanceProfile: iam.CfnInstanceProfile;
    public readonly instanceProfileName: string;
    public readonly instanceProfileArn: string;

    constructor(scope: Construct, id: string) {
        super(scope, id);

        // Create IAM role for EC2 instances
        this.role = new iam.Role(this, "DCVInstanceRole", {
            assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
            description: "IAM role for DCV streaming EC2 instances",
            managedPolicies: [
                // SSM managed policy for Systems Manager access
                iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
                // CloudWatch for logging
                iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchAgentServerPolicy"),
            ],
        });

        // Add inline policy for DCV-specific permissions
        this.role.addToPolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                    // Allow instance to describe itself
                    "ec2:DescribeInstances",
                    "ec2:DescribeTags",
                ],
                resources: ["*"],
            }),
        );

        // Create instance profile
        // Using a unique name based on the stack to avoid conflicts
        this.instanceProfile = new iam.CfnInstanceProfile(this, "DCVInstanceProfile", {
            roles: [this.role.roleName],
        });

        // Use ref for the name since instanceProfileName isn't set explicitly
        this.instanceProfileName = this.instanceProfile.ref;
        this.instanceProfileArn = this.instanceProfile.attrArn;

        // Output the instance profile ARN
        new cdk.CfnOutput(this, "InstanceProfileArn", {
            value: this.instanceProfileArn,
            description: "ARN of the EC2 instance profile for DCV instances",
            exportName: "DCVInstanceProfileArn",
        });

        new cdk.CfnOutput(this, "InstanceProfileName", {
            value: this.instanceProfileName,
            description: "Name of the EC2 instance profile for DCV instances",
            exportName: "DCVInstanceProfileName",
        });
    }
}
