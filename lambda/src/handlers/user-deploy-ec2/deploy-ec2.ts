export const handler = async (event: DeployEc2Event): Promise<DeployEc2Result> => {
    // TODO: use userId for deploying EC2 instance
    console.log("Stub - Deploying EC2 instance for user", event.userId);
    return { success: true };
};

type DeployEc2Event = {
    userId: string;
};

type DeployEc2Result = {
    success: boolean;
};
