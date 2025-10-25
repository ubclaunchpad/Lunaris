import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const body = JSON.parse(event.body || '{}')
    const userId = body.userId
    return {
        statusCode: 200,
        body: JSON.stringify({message: "hello! this is the deployInstance handler"})
    };
};
