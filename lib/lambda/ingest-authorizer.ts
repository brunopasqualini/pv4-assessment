import { APIGatewayRequestSimpleAuthorizerHandlerV2 } from 'aws-lambda';

export const handler: APIGatewayRequestSimpleAuthorizerHandlerV2 = async (event) => {
  const headers = event.headers ?? {};
  const reqApiKey = headers['x-api-key'];

  const expectedApiKey = process.env.API_KEY;

  const isAuthorized = Boolean(reqApiKey && expectedApiKey && reqApiKey === expectedApiKey);

  return { isAuthorized };
};
