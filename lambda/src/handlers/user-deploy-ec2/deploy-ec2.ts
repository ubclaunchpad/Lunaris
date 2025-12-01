import EC2Wrapper, { type EC2InstanceConfig } from "../../utils/ec2Wrapper";
import SSMWrapper from "../../utils/ssmWrapper";
import { randomBytes } from "crypto";

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
 * Generates a cryptographically secure random password for DCV instances.
 * Each instance gets a unique password that is stored in DynamoDB.
 */
function generateSecurePassword(length: number = 24): string {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    const bytes = randomBytes(length);
    let password = "";
    for (let i = 0; i < length; i++) {
        password += charset[bytes[i] % charset.length];
    }
    return password;
}

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

# ============================================
# Disable IE Enhanced Security Configuration
# ============================================
try {
    "$(Get-Date) - Disabling IE Enhanced Security..." | Out-File -Append $LogFile
    $AdminKey = "HKLM:\\SOFTWARE\\Microsoft\\Active Setup\\Installed Components\\{A509B1A7-37EF-4b3f-8CFC-4F3A74704073}"
    $UserKey = "HKLM:\\SOFTWARE\\Microsoft\\Active Setup\\Installed Components\\{A509B1A8-37EF-4b3f-8CFC-4F3A74704073}"
    Set-ItemProperty -Path $AdminKey -Name "IsInstalled" -Value 0 -Force -ErrorAction SilentlyContinue
    Set-ItemProperty -Path $UserKey -Name "IsInstalled" -Value 0 -Force -ErrorAction SilentlyContinue
    "$(Get-Date) - IE Enhanced Security disabled" | Out-File -Append $LogFile
} catch {
    "$(Get-Date) - Error disabling IE ESC: $_" | Out-File -Append $LogFile
}

# ============================================
# Set Microsoft Edge as default browser
# ============================================
try {
    "$(Get-Date) - Setting Edge as default browser..." | Out-File -Append $LogFile
    
    # Set Edge as default for HTTP/HTTPS
    $RegPath = "HKCU:\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations"
    New-Item -Path "$RegPath\\http\\UserChoice" -Force | Out-Null
    New-Item -Path "$RegPath\\https\\UserChoice" -Force | Out-Null
    
    # Create default browser XML for DISM
    $DefaultBrowserXml = @"
<?xml version="1.0" encoding="UTF-8"?>
<DefaultAssociations>
  <Association Identifier=".htm" ProgId="MSEdgeHTM" ApplicationName="Microsoft Edge" />
  <Association Identifier=".html" ProgId="MSEdgeHTM" ApplicationName="Microsoft Edge" />
  <Association Identifier="http" ProgId="MSEdgeHTM" ApplicationName="Microsoft Edge" />
  <Association Identifier="https" ProgId="MSEdgeHTM" ApplicationName="Microsoft Edge" />
</DefaultAssociations>
"@
    $XmlPath = "C:\\ProgramData\\Lunaris\\DefaultBrowser.xml"
    $DefaultBrowserXml | Out-File -FilePath $XmlPath -Encoding UTF8
    
    # Apply default associations
    Dism.exe /Online /Import-DefaultAppAssociations:$XmlPath 2>&1 | Out-File -Append $LogFile
    
    "$(Get-Date) - Edge set as default browser" | Out-File -Append $LogFile
} catch {
    "$(Get-Date) - Error setting default browser: $_" | Out-File -Append $LogFile
}

# ============================================
# SSL Certificate Setup with Let's Encrypt
# ============================================
try {
    "$(Get-Date) - Starting SSL certificate setup..." | Out-File -Append $LogFile
    
    # Get public IP address from EC2 metadata
    $Token = Invoke-RestMethod -Headers @{"X-aws-ec2-metadata-token-ttl-seconds" = "21600"} -Method PUT -Uri http://169.254.169.254/latest/api/token
    $PublicIP = Invoke-RestMethod -Headers @{"X-aws-ec2-metadata-token" = $Token} -Uri http://169.254.169.254/latest/meta-data/public-ipv4
    "$(Get-Date) - Public IP: $PublicIP" | Out-File -Append $LogFile
    
    # Convert IP to nip.io domain (replace dots with dashes)
    $NipDomain = ($PublicIP -replace '\\.','-') + ".nip.io"
    "$(Get-Date) - Using domain: $NipDomain" | Out-File -Append $LogFile
    
    # Create certificate directory
    $CertDir = "C:\\DCV-Certs"
    New-Item -ItemType Directory -Force -Path $CertDir | Out-Null
    
    # Download win-acme if not exists
    $WinAcmePath = "C:\\win-acme"
    if (-not (Test-Path "$WinAcmePath\\wacs.exe")) {
        "$(Get-Date) - Downloading win-acme..." | Out-File -Append $LogFile
        New-Item -ItemType Directory -Force -Path $WinAcmePath | Out-Null
        $WinAcmeUrl = "https://github.com/win-acme/win-acme/releases/download/v2.2.9.1701/win-acme.v2.2.9.1701.x64.pluggable.zip"
        $ZipPath = "$WinAcmePath\\win-acme.zip"
        
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $WinAcmeUrl -OutFile $ZipPath -UseBasicParsing
        Expand-Archive -Path $ZipPath -DestinationPath $WinAcmePath -Force
        Remove-Item $ZipPath
        "$(Get-Date) - win-acme downloaded and extracted" | Out-File -Append $LogFile
    }
    
    # Request certificate using win-acme (HTTP validation on port 80)
    # Temporarily open port 80 for ACME challenge
    New-NetFirewallRule -DisplayName "ACME HTTP Challenge" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow -ErrorAction SilentlyContinue
    
    "$(Get-Date) - Requesting Let's Encrypt certificate..." | Out-File -Append $LogFile
    $AcmeArgs = @(
        "--target", "manual",
        "--host", $NipDomain,
        "--validation", "selfhosting",
        "--validationport", "80",
        "--store", "pemfiles",
        "--pemfilespath", $CertDir,
        "--accepttos",
        "--emailaddress", "lunaris-dcv@noreply.lunaris.cloud"
    )
    
    & "$WinAcmePath\\wacs.exe" $AcmeArgs 2>&1 | Out-File -Append $LogFile
    
    # Check if certificate was created
    $CertFile = Get-ChildItem -Path $CertDir -Filter "*-crt.pem" | Select-Object -First 1
    $KeyFile = Get-ChildItem -Path $CertDir -Filter "*-key.pem" | Select-Object -First 1
    
    if ($CertFile -and $KeyFile) {
        "$(Get-Date) - Certificate files found: $($CertFile.Name), $($KeyFile.Name)" | Out-File -Append $LogFile
        
        # Copy certificate files to DCV's default certificate location
        # DCV reads from this location, not from registry settings
        $DcvCertDir = "C:\\Windows\\system32\\config\\systemprofile\\AppData\\Local\\NICE\\dcv\\private"
        
        if (-not (Test-Path $DcvCertDir)) {
            New-Item -Path $DcvCertDir -Force -ItemType Directory | Out-Null
        }
        
        # Copy cert and key with the names DCV expects
        Copy-Item -Path $CertFile.FullName -Destination "$DcvCertDir\\dcv.pem" -Force
        Copy-Item -Path $KeyFile.FullName -Destination "$DcvCertDir\\dcv.key" -Force
        
        "$(Get-Date) - Certificate files copied to DCV directory" | Out-File -Append $LogFile
        
        # Restart DCV server to apply certificate
        Restart-Service -Name "dcvserver" -Force
        "$(Get-Date) - DCV server restarted with new certificate" | Out-File -Append $LogFile
        
        # Store the domain in a file for reference
        $NipDomain | Out-File -FilePath "$CertDir\\domain.txt"
    } else {
        "$(Get-Date) - Certificate files not found, DCV will use self-signed cert" | Out-File -Append $LogFile
    }
    
    # Remove temporary firewall rule
    Remove-NetFirewallRule -DisplayName "ACME HTTP Challenge" -ErrorAction SilentlyContinue
    
} catch {
    "$(Get-Date) - Error setting up SSL certificate: $_" | Out-File -Append $LogFile
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

        // Generate a unique password for this instance
        // This password is stored in DynamoDB (encrypted at rest) alongside the session data
        const dcvPassword = generateSecurePassword();

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
