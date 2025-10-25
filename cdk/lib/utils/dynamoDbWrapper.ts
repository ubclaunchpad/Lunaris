import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  type TranslateConfig,
  type GetCommandInput,
  type PutCommandInput,
  type GetCommandOutput,
  type UpdateCommandInput,
} from "@aws-sdk/lib-dynamodb";

class DynamoDBWrapper {
  private client: DynamoDBDocumentClient;
  private tableName: string;

  constructor(tableName: string, translateConfig?: TranslateConfig) {
    // DynamoDBDocumentClient allows use of native JS types rather than aws AttributeValue types
    this.client = DynamoDBDocumentClient.from(
      new DynamoDBClient({}),
      translateConfig
    );
    this.tableName = tableName;
  }

  async getItem(
    key: GetCommandInput["Key"],
    options?: Partial<GetCommandInput>
  ): Promise<GetCommandOutput["Item"] | null> {
    const inputConfig: GetCommandInput = {
      ...(options ?? {}),
      TableName: this.tableName,
      Key: key,
    };

    const response = await this.client.send(new GetCommand(inputConfig));
    return response?.Item ?? null;
  }

  async putItem(
    Item: PutCommandInput["Item"],
    options?: Partial<PutCommandInput>
  ) {
    const inputConfig: PutCommandInput = {
      ...(options ?? {}),
      TableName: this.tableName,
      Item,
    };

    await this.client.send(new PutCommand(inputConfig));
  }

  async updateItem(
    key: UpdateCommandInput["Key"],
    options?: Partial<UpdateCommandInput>
  ) {
    const inputConfig: UpdateCommandInput = {
      ...(options ?? {}),
      TableName: this.tableName,
      Key: key,
    };

    await this.client.send(new UpdateCommand(inputConfig));
  }
}

export default DynamoDBWrapper;
