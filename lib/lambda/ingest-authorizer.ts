import { APIGatewayRequestSimpleAuthorizerHandlerV2 } from 'aws-lambda';
import { ENV_INGEST_API_KEY } from '../utils/consts';

const API_KEY = process.env[ENV_INGEST_API_KEY];

export const handler: APIGatewayRequestSimpleAuthorizerHandlerV2 = async (event) => {
  const headers = event.headers ?? {};
  const reqApiKey = headers['x-api-key'];

  const isAuthorized = Boolean(reqApiKey && API_KEY && reqApiKey === API_KEY);

  return { isAuthorized };
};
