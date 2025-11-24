export interface DynamoDbWrapperProps {
    tableName: string;
    partitionKey: string;
    sortKey?: string;
    indexKey?: string;
    indexSortKey?: string;
    indexName?: string;
    indexType?: string;
}

export interface RunningStreamsTableProps extends DynamoDbWrapperProps {
    tableName: "RunningStreams";
    partitionKey: "instanceArn";
}

export interface RunningInstancesTableProps extends DynamoDbWrapperProps {
    tableName: "RunningInstances";
    partitionKey: "instanceId";
}
