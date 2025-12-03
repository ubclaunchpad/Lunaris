import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from "@aws-sdk/client-ssm";

type ConfigureDcvEvent = {
    instanceId: string;
    dcvIp: string;
    dcvPassword: string;
};

type ConfigureDcvResult = {
    success: boolean;
    sslConfigured: boolean;
    passwordSet: boolean;
    message: string;
};

const ssmClient = new SSMClient({ region: process.env.AWS_REGION || "us-west-2" });

/**
 * Waits for an SSM command to complete and returns the result
 */
async function waitForCommand(
    commandId: string,
    instanceId: string,
    timeoutMs: number = 120000,
): Promise<{ success: boolean; output: string; error: string }> {
    const startTime = Date.now();
    const pollInterval = 5000;

    while (Date.now() - startTime < timeoutMs) {
        try {
            const result = await ssmClient.send(
                new GetCommandInvocationCommand({
                    CommandId: commandId,
                    InstanceId: instanceId,
                }),
            );

            if (result.Status === "Success") {
                return {
                    success: true,
                    output: result.StandardOutputContent || "",
                    error: result.StandardErrorContent || "",
                };
            } else if (
                result.Status === "Failed" ||
                result.Status === "Cancelled" ||
                result.Status === "TimedOut"
            ) {
                return {
                    success: false,
                    output: result.StandardOutputContent || "",
                    error: result.StandardErrorContent || result.StatusDetails || "Command failed",
                };
            }
            // Still in progress, wait and retry
            await new Promise((resolve) => setTimeout(resolve, pollInterval));
        } catch (err: unknown) {
            // InvocationDoesNotExist means the command hasn't started yet
            if (err instanceof Error && err.name === "InvocationDoesNotExist") {
                await new Promise((resolve) => setTimeout(resolve, pollInterval));
                continue;
            }
            throw err;
        }
    }

    return { success: false, output: "", error: "Command timed out" };
}

/**
 * Runs a PowerShell command on the instance via SSM
 */
async function runCommand(
    instanceId: string,
    commands: string[],
): Promise<{ success: boolean; output: string; error: string }> {
    const response = await ssmClient.send(
        new SendCommandCommand({
            InstanceIds: [instanceId],
            DocumentName: "AWS-RunPowerShellScript",
            Parameters: {
                commands: commands,
            },
            TimeoutSeconds: 300,
        }),
    );

    if (!response.Command?.CommandId) {
        throw new Error("Failed to send SSM command");
    }

    return waitForCommand(response.Command.CommandId, instanceId);
}

/**
 * Configures a DCV instance after deployment:
 * 1. Sets Administrator password
 * 2. Disables IE Enhanced Security
 * 3. Sets up Let's Encrypt SSL certificate
 * 4. Restarts DCV with the new certificate
 */
export const handler = async (event: ConfigureDcvEvent): Promise<ConfigureDcvResult> => {
    console.log("Configuring DCV instance:", JSON.stringify(event));

    const { instanceId, dcvIp, dcvPassword } = event;

    if (!instanceId || !dcvIp || !dcvPassword) {
        throw new Error("Missing required fields: instanceId, dcvIp, dcvPassword");
    }

    // Convert IP to nip.io domain format
    const nipDomain = dcvIp.replace(/\./g, "-") + ".nip.io";
    let passwordSet = false;
    let sslConfigured = false;

    try {
        // Step 1: Set Administrator password
        console.log("Setting Administrator password...");
        const passwordResult = await runCommand(instanceId, [
            `$SecurePassword = ConvertTo-SecureString '${dcvPassword}' -AsPlainText -Force`,
            `$UserAccount = Get-LocalUser -Name "Administrator"`,
            `$UserAccount | Set-LocalUser -Password $SecurePassword`,
            `Write-Host "Password set successfully"`,
        ]);

        if (passwordResult.success) {
            passwordSet = true;
            console.log("Password set successfully");
        } else {
            console.error("Failed to set password:", passwordResult.error);
        }

        // Step 2: Disable IE Enhanced Security
        console.log("Disabling IE Enhanced Security...");
        await runCommand(instanceId, [
            `$AdminKey = "HKLM:\\SOFTWARE\\Microsoft\\Active Setup\\Installed Components\\{A509B1A7-37EF-4b3f-8CFC-4F3A74704073}"`,
            `$UserKey = "HKLM:\\SOFTWARE\\Microsoft\\Active Setup\\Installed Components\\{A509B1A8-37EF-4b3f-8CFC-4F3A74704073}"`,
            `Set-ItemProperty -Path $AdminKey -Name "IsInstalled" -Value 0 -Force -ErrorAction SilentlyContinue`,
            `Set-ItemProperty -Path $UserKey -Name "IsInstalled" -Value 0 -Force -ErrorAction SilentlyContinue`,
        ]);

        // Step 3: Create directories and download win-acme
        console.log("Setting up SSL certificate...");
        await runCommand(instanceId, [
            `New-Item -ItemType Directory -Force -Path C:\\win-acme | Out-Null`,
            `New-Item -ItemType Directory -Force -Path C:\\DCV-Certs | Out-Null`,
            `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12`,
            `if (-not (Test-Path "C:\\win-acme\\wacs.exe")) {`,
            `  Invoke-WebRequest -Uri "https://github.com/win-acme/win-acme/releases/download/v2.2.9.1701/win-acme.v2.2.9.1701.x64.pluggable.zip" -OutFile "C:\\win-acme\\win-acme.zip" -UseBasicParsing`,
            `  Expand-Archive -Path "C:\\win-acme\\win-acme.zip" -DestinationPath "C:\\win-acme" -Force`,
            `}`,
            `Write-Host "win-acme ready"`,
        ]);

        // Step 4: Open firewall and request certificate
        console.log("Requesting Let's Encrypt certificate for", nipDomain);
        const certResult = await runCommand(instanceId, [
            `New-NetFirewallRule -DisplayName "Allow HTTP for ACME" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow -ErrorAction SilentlyContinue | Out-Null`,
            `C:\\win-acme\\wacs.exe --source manual --host ${nipDomain} --validation selfhosting --store pemfiles --pemfilespath C:\\DCV-Certs --accepttos --emailaddress lunaris-ssl@noreply.lunaris.cloud`,
        ]);

        if (certResult.output.includes("created") || certResult.output.includes("Certificate")) {
            console.log("Certificate obtained successfully");

            // Step 5: Copy certificate to DCV location and restart
            const copyResult = await runCommand(instanceId, [
                `$DcvCertDir = "C:\\Windows\\system32\\config\\systemprofile\\AppData\\Local\\NICE\\dcv\\private"`,
                `$CertFile = Get-ChildItem -Path "C:\\DCV-Certs" -Filter "*-crt.pem" | Select-Object -First 1`,
                `$KeyFile = Get-ChildItem -Path "C:\\DCV-Certs" -Filter "*-key.pem" | Select-Object -First 1`,
                `if ($CertFile -and $KeyFile) {`,
                `  Copy-Item -Path $CertFile.FullName -Destination "$DcvCertDir\\dcv.pem" -Force`,
                `  Copy-Item -Path $KeyFile.FullName -Destination "$DcvCertDir\\dcv.key" -Force`,
                `  Restart-Service dcvserver -Force`,
                `  Write-Host "SSL configured and DCV restarted"`,
                `} else {`,
                `  Write-Host "Certificate files not found"`,
                `}`,
            ]);

            if (copyResult.output.includes("SSL configured")) {
                sslConfigured = true;
                console.log("SSL configured successfully");
            }
        } else {
            console.error("Certificate request may have failed:", certResult.output);
        }

        return {
            success: passwordSet && sslConfigured,
            passwordSet,
            sslConfigured,
            message: `Password: ${passwordSet ? "OK" : "FAILED"}, SSL: ${sslConfigured ? "OK" : "FAILED"}`,
        };
    } catch (err: unknown) {
        console.error("Configuration error:", err);
        return {
            success: false,
            passwordSet,
            sslConfigured,
            message: err instanceof Error ? err.message : "Unknown error",
        };
    }
};
