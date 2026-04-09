import { NextResponse } from 'next/server';
import { fetchWithJiraAuth } from '../../../lib/jira-auth';

export async function GET() {
  console.log('--- Test Jira Auth API Route Hit ---');
  try {
    // Using the Jira site URL identified in your previous successful logs.
    // For a production scenario, this URL would typically be discovered dynamically
    // via the 'accessible-resources' endpoint after initial OAuth.
    const siteUrl = "https://r3sl2cap.atlassian.net"; 

    if (!siteUrl) {
        const errorMessage = 'TestJiraAuth: Jira site URL is not defined. This should not happen if hardcoded.';
        console.error(errorMessage);
        return NextResponse.json(
            { success: false, error: errorMessage},
            { status: 500 }
        );
    }

    const myselfUrl = `${siteUrl}/rest/api/3/myself`;
    console.log(`TestJiraAuth: Attempting to fetch user details from: ${myselfUrl}`);

    const response = await fetchWithJiraAuth(myselfUrl);

    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage = `TestJiraAuth: API call to ${myselfUrl} failed`;
      console.error(errorMessage, { status: response.status, details: errorText });
      return NextResponse.json(
        { success: false, error: errorMessage, details: errorText, status: response.status },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log(`TestJiraAuth: Successfully fetched data from ${myselfUrl}`);
    return NextResponse.json({ success: true, data, siteUsed: siteUrl });

  } catch (error: any) {
    const errorMessage = 'TestJiraAuth: Unexpected error in GET handler';
    console.error(errorMessage, error);
    return NextResponse.json(
      { success: false, error: errorMessage, details: error.message },
      { status: 500 }
    );
  }
}
