export const TEAMS_CLIENT_ID = process.env.TEAMS_CLIENT_ID;
export const TEAMS_CLIENT_SECRET = process.env.TEAMS_CLIENT_SECRET;
export const TEAMS_OAUTH_REDIRECT_URI = process.env.TEAMS_OAUTH_REDIRECT_URI;

export function getTeamsOAuthAuthorizeUrl(state: string) {
  const params = new URLSearchParams({
    client_id: TEAMS_CLIENT_ID || '',
    response_type: 'code',
    redirect_uri: TEAMS_OAUTH_REDIRECT_URI || '',
    response_mode: 'query',
    scope: 'User.Read offline_access ChannelMessage.Send Team.ReadBasic.All Channel.ReadBasic.All',
    state,
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
}

export async function exchangeTeamsOAuthCode(code: string) {
  const params = new URLSearchParams({
    client_id: TEAMS_CLIENT_ID || '',
    scope: 'User.Read offline_access ChannelMessage.Send Team.ReadBasic.All Channel.ReadBasic.All',
    code,
    redirect_uri: TEAMS_OAUTH_REDIRECT_URI || '',
    grant_type: 'authorization_code',
    client_secret: TEAMS_CLIENT_SECRET || '',
  });

  const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error('Failed to exchange Teams OAuth code');
  }
  return await response.json();
} 