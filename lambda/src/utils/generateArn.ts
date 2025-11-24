export const generateArn = (region: string, instanceId: string): string => {
    const accountId = process.env.CDK_DEFAULT_ACCOUNT || "unknown";
    return `arn:aws:ec2:${region}:${accountId}:instance/${instanceId}`;
};
