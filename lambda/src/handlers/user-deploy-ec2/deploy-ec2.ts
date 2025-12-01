import EC2Wrapper, { type EC2InstanceConfig } from "../../utils/ec2Wrapper";
import SSMWrapper from "../../utils/ssmWrapper";

type DeployEc2Event = {
    userId: string;
};

type DeployEC2Success = {
    success: boolean;
    instanceId: string;
    instanceArn: string;
    dcvIp: string;
    dcvPort: number;
    dcvUser: string;
    dcvPassword: string;
};

type DeployEC2Error = {
    success: false;
    error: string;
};

/**
 * Generates a PowerShell user data script for Windows DCV instances.
 * This script runs on first boot and can be used to configure the instance.
 */
function generateWindowsUserData(dcvPassword: string): string {
    // PowerShell script that runs on Windows instance startup
    return `<powershell>
# Log startup
Write-Host "Lunaris DCV Instance Starting..."
$LogFile = "C:\\ProgramData\\Lunaris\\startup.log"
New-Item -ItemType Directory -Force -Path "C:\\ProgramData\\Lunaris" | Out-Null

# Set Administrator password
try {
    $SecurePassword = ConvertTo-SecureString "${dcvPassword}" -AsPlainText -Force
    $UserAccount = Get-LocalUser -Name "Administrator"
    $UserAccount | Set-LocalUser -Password $SecurePassword
    "$(Get-Date) - Administrator password set successfully" | Out-File -Append $LogFile
} catch {
    "$(Get-Date) - Failed to set Administrator password: $_" | Out-File -Append $LogFile
}

# Ensure DCV server is running
try {
    $dcvService = Get-Service -Name "dcvserver" -ErrorAction SilentlyContinue
    if ($dcvService) {
        if ($dcvService.Status -ne 'Running') {
            Start-Service -Name "dcvserver"
            "$(Get-Date) - DCV Server started" | Out-File -Append $LogFile
        } else {
            "$(Get-Date) - DCV Server already running" | Out-File -Append $LogFile
        }
    } else {
        "$(Get-Date) - DCV Server service not found" | Out-File -Append $LogFile
    }
} catch {
    "$(Get-Date) - Error managing DCV service: $_" | Out-File -Append $LogFile
}

# Create a console session for Administrator if not exists
try {
    & "C:\\Program Files\\NICE\\DCV\\Server\\bin\\dcv.exe" create-session --type=console --owner Administrator console 2>&1 | Out-File -Append $LogFile
    "$(Get-Date) - DCV session created or already exists" | Out-File -Append $LogFile
} catch {
    "$(Get-Date) - Error creating DCV session: $_" | Out-File -Append $LogFile
}

"$(Get-Date) - Startup script completed" | Out-File -Append $LogFile
</powershell>
<persist>true</persist>`;
}

export const handler = async (
    event: DeployEc2Event,
): Promise<DeployEC2Success | DeployEC2Error> => {
    try {
        const ssmWrapper = new SSMWrapper();
        const amiId = await ssmWrapper.getParamFromParamStore("ami_id");

        if (!amiId) {
            throw new Error("AMI ID not found in Parameter Store");
        }

        const ec2Wrapper = new EC2Wrapper(process.env.LAMBDA_REGION || "us-west-2");
        const dcvPassword = process.env.DCV_PASSWORD || "";

        const instanceConfig: EC2InstanceConfig = {
            userId: event.userId,
            amiId: amiId,
            securityGroupIds: process.env.SECURITY_GROUP_ID
                ? [process.env.SECURITY_GROUP_ID]
                : undefined,
            subnetId: process.env.SUBNET_ID,
            keyName: process.env.KEY_PAIR_NAME,
            iamInstanceProfile: process.env.EC2_INSTANCE_PROFILE_NAME,
            userDataScript: generateWindowsUserData(dcvPassword),
        };

        const instance = await ec2Wrapper.createAndWaitForInstance(instanceConfig);

        return {
            success: true,
            instanceId: instance.instanceId,
            instanceArn: instance.instanceArn,
            dcvIp: instance.publicIp || "",
            dcvPort: 8443,
            dcvUser: "Administrator",
            dcvPassword: dcvPassword,
        };
    } catch (err: unknown) {
        if (err instanceof Error) {
            console.error("Instance deployment failed:", err);
            return {
                success: false,
                error: err.message || "Unknown error during instance creation",
            };
        }

        return { success: false, error: String(err) };
    }
};
