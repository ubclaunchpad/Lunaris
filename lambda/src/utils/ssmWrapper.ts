import { readFileSync } from "fs";
import { join } from "path";
import {
    SendCommandCommand,
    GetDocumentCommand,
    SSMClient,
    CreateDocumentCommand,
    GetCommandInvocationCommand,
    type CreateDocumentCommandInput,
    type SendCommandCommandInput,
    type GetCommandInvocationCommandInput,
    GetParameterCommand,
    PutParameterCommand,
} from "@aws-sdk/client-ssm";

const INSTALL_DCV_DOCUMENT_NAME = "Lunaris-Install-DCV-Document";
const INSTALL_DCV_DOCUMENT_FILE_NAME = "install_dcv.yml";

const RUN_SESSION_DOCUMENT_NAME = "Lunaris-Run-DCV-Session-Document";
const RUN_SESSION_DOCUMENT_FILE_NAME = "run_dcv.yml";

interface InstallDCVParams {
    instanceId: string;
    dcvMsiUrl?: string | undefined;
}

interface RunDCVParams {
    instanceId: string;
    sessionName: string;
    sessionOwner?: string;
}

class SSMWrapper {
    private client: SSMClient;

    constructor() {
        this.client = new SSMClient();
    }

    async runInstall(params: InstallDCVParams): Promise<string> {
        try {
            // Check if document exists, create if not
            await this.ensureDocumentExists(
                INSTALL_DCV_DOCUMENT_NAME,
                INSTALL_DCV_DOCUMENT_FILE_NAME,
            );

            // Send SSM command with parameters
            const commandId = await this.sendSSMCommand(
                params.instanceId,
                INSTALL_DCV_DOCUMENT_NAME,
                params.dcvMsiUrl ? { DcvMsiUrl: [params.dcvMsiUrl] } : undefined,
            );

            return commandId;
        } catch (err: any) {
            console.error("Failed to run DCV installation:", err);
            throw err;
        }
    }

    async runCreateSession(params: RunDCVParams): Promise<string> {
        try {
            // here i need to create the run doc
            await this.ensureDocumentExists(
                RUN_SESSION_DOCUMENT_NAME,
                RUN_SESSION_DOCUMENT_FILE_NAME,
            );

            // Send SSM command with parameters
            const parameters: { [key: string]: string[] } = {
                SessionName: [params.sessionName],
            };

            if (params.sessionOwner) {
                parameters.SessionOwner = [params.sessionOwner];
            }

            const commandId = await this.sendSSMCommand(
                params.instanceId,
                RUN_SESSION_DOCUMENT_NAME,
                parameters,
            );

            return commandId;
        } catch (err: any) {
            throw err;
        }
    }

    private async ensureDocumentExists(docName: string, docFile: string): Promise<void> {
        try {
            await this.getDocument(docName);
        } catch (err: any) {
            if (err.name === "InvalidDocument") {
                await this.createDocument(docName, docFile);
            } else {
                throw err;
            }
        }
    }

    private async sendSSMCommand(
        instanceId: string,
        documentName: string,
        parameters?: { [key: string]: string[] },
    ): Promise<string> {
        try {
            const input: SendCommandCommandInput = {
                InstanceIds: [instanceId],
                DocumentName: documentName,
                Parameters: parameters,
                TimeoutSeconds: documentName === INSTALL_DCV_DOCUMENT_NAME ? 1800 : 300,
                Comment: `Lunaris DCV installation on ${instanceId}`,
            };

            const command = new SendCommandCommand(input);
            const response = await this.client.send(command);

            if (!response.Command?.CommandId) {
                throw new Error("No CommandId returned from SSM");
            }

            return response.Command.CommandId;
        } catch (err: any) {
            console.error("Sending SSM command failed:", err);
            throw err;
        }
    }

    private async getDocument(docName: string): Promise<string> {
        try {
            const response = await this.client.send(new GetDocumentCommand({ Name: docName }));

            if (!response.Name) {
                throw new Error("Document exists but has no name");
            }

            return response.Name;
        } catch (error: any) {
            throw error;
        }
    }

    private async createDocument(docName: string, docFile: string): Promise<void> {
        try {
            const yamlPath = join(__dirname, `./documents/${docFile}`);
            const yamlContent = readFileSync(yamlPath, "utf-8");

            const input: CreateDocumentCommandInput = {
                Content: yamlContent,
                Name: docName,
                DocumentFormat: "YAML",
                DocumentType: "Command",
                Tags: [
                    { Key: "Application", Value: "Lunaris" },
                    { Key: "ManagedBy", Value: "Lambda" },
                ],
            };

            const command = new CreateDocumentCommand(input);
            await this.client.send(command);
        } catch (error: any) {
            if (error.name === "DocumentAlreadyExistsException") {
                return;
            }
            console.error("Failed to create SSM document:", error);
            throw error;
        }
    }

    async getCommandStatus(commandId: string, instanceId: string): Promise<string> {
        try {
            const input: GetCommandInvocationCommandInput = {
                CommandId: commandId,
                InstanceId: instanceId,
            };

            const response = await this.client.send(new GetCommandInvocationCommand(input));

            return response.Status || "Unknown";
        } catch (err: any) {
            console.error("Error getting command status:", err);
            throw err;
        }
    }

    async getParamFromParamStore(paramName: string): Promise<string> {
        try {
            const command = new GetParameterCommand({
                Name: paramName,
            });

            const response = await this.client.send(command);
            if (!response.Parameter?.Value) {
                throw new Error(`Parameter ${paramName} must have a value`);
            }

            return response.Parameter.Value;
        } catch (error) {
            console.error(`Unable to get parameter ${paramName}`, error);
            return "";
        }
    }

    async putParamInParamStore(paramName: string, paramValue: string): Promise<number> {
        try {
            const command = new PutParameterCommand({
                Name: paramName,
                Value: paramValue,
            });

            const response = await this.client.send(command);
            if (!response.Version) {
                throw new Error("must return a version");
            }
            return response.Version;
        } catch (error) {
            console.error(`Unable to get parameter ${paramName}`, error);
            throw error;
        }
    }
}

export default SSMWrapper;
