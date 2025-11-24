import { SSMClient, SendCommandCommand, SendCommandCommandInput } from "@aws-sdk/client-ssm";
import EC2Wrapper from "./ec2Wrapper";
import SSMWrapper from "./ssmWrapper";

export interface StopDCVSessionResult {
  instanceId?: string;
  stoppedSuccessfully: boolean;
  message: string;
}

class DCVWrapper {
    private ssm: SSMWrapper;
    private ec2: EC2Wrapper;
    private instanceId: string;
    private userId: string;

    constructor(instanceId: string, userId: string) {
        this.ssm = new SSMWrapper();
        this.ec2 = new EC2Wrapper();
        this.instanceId = instanceId;
        this.userId = userId;
    }

    async getDCVSession(): Promise<string> {
        try {
            const instance = await this.ec2.getInstance(this.instanceId);

            const dcvTag = instance.Tags?.find((tag) => tag.Key === "dcvConfigured");
            const isDCVConfigured = dcvTag?.Value === "true";

            if (!isDCVConfigured) {
                await this.installDCV();
            }

            // call start dcv session
            const url = await this.createDCVSession();

            return url;
        } catch (error) {
            console.log("unable to install or start DCV streaming instance", error);
            throw error;
        }
    }

    async installDCV(): Promise<void> {
        try {
            const commandId = await this.ssm.runInstall({
                instanceId: this.instanceId,
            });

            console.log(`DCV installation started. Command ID: ${commandId}`);
            console.log(`Waiting for installation to complete (this takes ~10-15 minutes)...`);

            // wait since ssmCommands are async
            await this.waitForSSMCommand(commandId, 1800);

            console.log(`DCV installation completed`);

            // set tag dcvConfigured to true
            await this.ec2.modifyInstanceTag(this.instanceId, "dcvConfigured", "true");
        } catch (err: unknown) {
            console.error("DCV Install failed", err);
            throw err;
        }
    }

    async createDCVSession(): Promise<string> {
        try {
            const sessionName = `user-${this.userId}-session`;

            console.log(`Creating DCV session: ${sessionName}`);

            const commandId = await this.ssm.runCreateSession({
                instanceId: this.instanceId,
                sessionName: sessionName,
                sessionOwner: "Administrator",
            });

            console.log(`DCV session creation started. Command ID: ${commandId}`);
            console.log(`Waiting for session to be ready (~30 seconds)...`);

            // wait since ssmCommands are async
            await this.waitForSSMCommand(commandId, 300);

            console.log(`DCV session created`);

            // return streaming url
            const url = await this.getStreamingUrl();

            return url;
        } catch (error) {
            console.log(`DCV installation failed: ${error}`);
            throw error;
        }
    }

    async getStreamingUrl(): Promise<string> {
        try {
            const instance = await this.ec2.getInstance(this.instanceId);
            const publicIp = instance.PublicIpAddress;
            if (!publicIp) {
                throw new Error("Could not get public Ip");
            }

            // session name must match what createDCVSession created
            const sessionName = `user-${this.userId}-session`;

            // construct and return URL (encode session id)
            const url = `https://${publicIp}:8443?session-id=${encodeURIComponent(sessionName)}`;
            return url;
        } catch (error) {
            console.log("could not get streaming url", error);
            throw error;
        }
    }

/**
 * Stop DCV session gracefully (closes any active session)
 */
async stopDCVSession(): Promise<StopDCVSessionResult> {
    try {
        console.log(`Closing any active DCV sessions on instance ${this.instanceId}...`);

        // Call SSM wrapper to close all sessions
        const commandId = await this.ssm.runCloseDCVSession(this.instanceId);

        console.log(`DCV close-session command started. Command ID: ${commandId}`);
        console.log(`Waiting for DCV session to close (~30 seconds)...`);

        // Wait for SSM command to complete
        await this.waitForSSMCommand(commandId, 60);

        console.log(`DCV session closed successfully on ${this.instanceId}`);

        return <StopDCVSessionResult>{
           instanceId: this.instanceId,
          stoppedSuccessfully: true,
          message: `DCV session closed on ${this.instanceId}`
      };

    } catch (error: any) {
        console.error(`Failed to close DCV session:`, error);
        return <StopDCVSessionResult>{
           instanceId: this.instanceId,
          stoppedSuccessfully: false,
          message: `DCV close-session failed: ${error.message}`
      };
    }
}


    private async waitForSSMCommand(
        commandId: string,
        maxWaitSeconds: number = 600,
    ): Promise<void> {
        const startTime = Date.now();
        const maxWaitMs = maxWaitSeconds * 1000;
        const pollInterval = 10000;

        while (true) {
            try {
                // Check if command is still running
                const status = await this.ssm.getCommandStatus(commandId, this.instanceId);

                console.log(`Command ${commandId} status: ${status}`);

                if (status === "Success") {
                    return;
                }

                if (status === "Failed" || status === "Cancelled" || status === "TimedOut") {
                    throw new Error(`SSM command failed with status: ${status}`);
                }

                // check timeout
                if (Date.now() - startTime > maxWaitMs) {
                    throw new Error(
                        `Timeout waiting for SSM command ${commandId} (${maxWaitSeconds}s)`,
                    );
                }

                // wait before next poll
                await new Promise((resolve) => setTimeout(resolve, pollInterval));
            } catch (err: unknown) {
                console.error(`Error waiting for SSM command:`, err);
                throw err;
            }
        }
    }
}

export default DCVWrapper;