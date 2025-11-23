import {
    CreateRoleCommand,
    GetRoleCommand,
    IAMClient,
    AttachRolePolicyCommand,
    CreateInstanceProfileCommand,
    AddRoleToInstanceProfileCommand,
    type Role,
    type InstanceProfile,
    type AttachRolePolicyRequest,
    type CreateInstanceProfileCommandInput,
    type AddRoleToInstanceProfileRequest,
    GetInstanceProfileCommand,
} from "@aws-sdk/client-iam";

// class that creates/gets IAM permissions
const EC2_SSM_PROFILE = "Lunaris-EC2-SSM-Profile";
const EC2_SSM_ROLE = "Lunaris-EC2-SSM-Role";
const EC2_SSM_POLICY = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore";

class IAMWrapper {
    private iamClient: IAMClient;

    constructor() {
        this.iamClient = new IAMClient();
    }

    // get profile, calls get, if there isn't one, call getrole, createprofile and add the role
    async getProfile(): Promise<string> {
        try {
            const getProfileCommand = new GetInstanceProfileCommand({
                InstanceProfileName: EC2_SSM_PROFILE,
            });

            const profile = await this.iamClient.send(getProfileCommand);
            if (!profile.InstanceProfile?.Arn) {
                throw new Error("Failed to create instance profile - no name returned");
            }

            return profile.InstanceProfile.Arn;
        } catch (err: unknown) {
            if ((err as { name?: string }).name === "NoSuchEntityException") {
                const roleName = await this.getRole();
                const profile = await this.createProfile();

                if (!profile?.Arn || !profile?.InstanceProfileName) {
                    throw new Error("Failed to create instance profile - no name returned");
                }

                const profileName: string = profile.InstanceProfileName;
                await this.attachRoletoProfile(profileName, roleName);
                return profile.Arn;
            }
            throw err;
        }
    }

    // createProfile
    async createProfile(): Promise<InstanceProfile | undefined> {
        try {
            const input: CreateInstanceProfileCommandInput = {
                InstanceProfileName: EC2_SSM_PROFILE,
                Tags: [
                    { Key: "Application", Value: "Lunaris" },
                    { Key: "ManagedBy", Value: "Lambda" },
                ],
            };

            const command = new CreateInstanceProfileCommand(input);
            const response = await this.iamClient.send(command);
            return response.InstanceProfile;
        } catch (err: unknown) {
            if ((err as { name?: string }).name === "EntityAlreadyExistsException") {
                // Profile was created by another process, fetch it
                const getCommand = new GetInstanceProfileCommand({
                    InstanceProfileName: EC2_SSM_PROFILE,
                });
                const existing = await this.iamClient.send(getCommand);
                return existing.InstanceProfile;
            }
            throw err;
        }
    }

    // get EC2role calls get, if there isn't one, call create and attach policy
    async getRole(): Promise<string> {
        try {
            const getRoleCommand = new GetRoleCommand({ RoleName: EC2_SSM_ROLE });
            const role = await this.iamClient.send(getRoleCommand);
            if (!role.Role?.RoleName) {
                throw new Error("Failed to create Role - no name returned");
            }

            return role.Role!.RoleName;
        } catch (err: unknown) {
            // only create if role doesn't exist yet
            if ((err as { name?: string }).name == "NoSuchEntityException") {
                const createdRole = await this.createRole();
                if (!createdRole?.RoleName) {
                    throw new Error("Failed to create Role - no name returned");
                }
                return createdRole.RoleName;
            }
            throw err;
        }
    }

    // create EC2 role
    async createRole(): Promise<Role | undefined> {
        try {
            const document = JSON.stringify({
                Version: "2012-10-17",
                Statement: [
                    {
                        Effect: "Allow",
                        Principal: {
                            Service: "ec2.amazonaws.com",
                        },
                        Action: "sts:AssumeRole",
                    },
                ],
            });

            const command = new CreateRoleCommand({
                AssumeRolePolicyDocument: document,
                RoleName: EC2_SSM_ROLE,
                Description: "Role for EC2Instances that allows them to execute SSM commands",
                Tags: [
                    { Key: "Application", Value: "Lunaris" },
                    { Key: "ManagedBy", Value: "Lambda" },
                ],
            });

            const response = await this.iamClient.send(command);

            // attach SSM Policy
            await this.attachSSMPolicy(EC2_SSM_ROLE, EC2_SSM_POLICY);

            return response.Role;
        } catch (err: unknown) {
            if ((err as { name?: string }).name === "EntityAlreadyExistsException") {
                // Role exists, just get it
                const getCommand = new GetRoleCommand({ RoleName: EC2_SSM_ROLE });
                const existing = await this.iamClient.send(getCommand);
                return existing.Role;
            }
            throw err;
        }
    }

    // attach EC2 policy
    async attachSSMPolicy(roleName: string, policy: string): Promise<void> {
        try {
            const input: AttachRolePolicyRequest = {
                RoleName: roleName,
                PolicyArn: policy,
            };

            const command = new AttachRolePolicyCommand(input);
            await this.iamClient.send(command);
        } catch (err: unknown) {
            if ((err as { name?: string }).name === "LimitExceededException") {
                // Policy already attached, ignore
                console.log(`Policy ${policy} already attached to ${roleName}`);
                return;
            }
            throw err;
        }
    }

    async attachRoletoProfile(profileName: string, roleName: string): Promise<void> {
        try {
            const input: AddRoleToInstanceProfileRequest = {
                InstanceProfileName: profileName,
                RoleName: roleName,
            };

            const command = new AddRoleToInstanceProfileCommand(input);
            await this.iamClient.send(command);
        } catch (err: unknown) {
            if ((err as { name?: string }).name === "LimitExceededException") {
                // Role already attached to profile
                console.log(`Role ${roleName} already attached to ${profileName}`);
                return;
            }
            throw err;
        }
    }
}

export default IAMWrapper;
