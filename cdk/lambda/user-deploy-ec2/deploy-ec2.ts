export const handler = async (
  event: DeployEc2Event
): Promise<DeployEc2Result> => {
  const userId = event.userId; // TODO: use userId for deploying EC2 instance

  console.log("Stub - Deploying EC2 instance for user");
  return { success: true };
};

type DeployEc2Event = {
  userId: string;
};

type DeployEc2Result = {
  success: boolean;
};
