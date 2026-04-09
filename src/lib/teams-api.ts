export interface Team {
  id: string;
  displayName: string;
}

export interface Channel {
  id: string;
  displayName: string;
}

export async function listTeams(accessToken: string): Promise<Team[]> {
  const response = await fetch('https://graph.microsoft.com/v1.0/me/joinedTeams', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error('Failed to fetch teams');
  const data = await response.json();
  return data.value.map((t: any) => ({ id: t.id, displayName: t.displayName }));
}

export async function listChannels(accessToken: string, teamId: string): Promise<Channel[]> {
  const response = await fetch(`https://graph.microsoft.com/v1.0/teams/${teamId}/channels`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error('Failed to fetch channels');
  const data = await response.json();
  return data.value.map((c: any) => ({ id: c.id, displayName: c.displayName }));
}

export async function sendMessageToChannel(accessToken: string, teamId: string, channelId: string, message: string): Promise<void> {
  const response = await fetch(`https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ body: { content: message } }),
  });
  if (!response.ok) throw new Error('Failed to send message to Teams channel');
} 