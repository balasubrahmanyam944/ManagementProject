import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { serverUrl, email, apiKey } = await request.json()
    
    console.log('TestRail Test: Testing connection with:', {
      serverUrl,
      email,
      apiKeyLength: apiKey?.length,
      apiKeyPreview: apiKey ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}` : 'none'
    })

    if (!serverUrl || !email || !apiKey) {
      return NextResponse.json({ 
        error: 'Missing required parameters' 
      }, { status: 400 })
    }

    // Validate API key length - some TestRail instances provide shorter keys
    if (apiKey.length < 20) {
      return NextResponse.json({ 
        error: 'API key appears to be too short. Please check your TestRail API key.',
        apiKeyLength: apiKey.length
      }, { status: 400 })
    }

    // Clean up server URL
    let cleanServerUrl = serverUrl.trim()
    if (cleanServerUrl.endsWith('/')) {
      cleanServerUrl = cleanServerUrl.slice(0, -1)
    }

    const authHeader = `Basic ${Buffer.from(`${email}:${apiKey}`).toString('base64')}`
    console.log('TestRail Test: Using auth header (first 20 chars):', authHeader.substring(0, 20) + '...')
    console.log('TestRail Test: Decoded auth check:', Buffer.from(authHeader.substring(6), 'base64').toString())

    // Try multiple endpoint formats
    const endpoints = [
      `${cleanServerUrl}/index.php?/api/v2/get_projects`,
      `${cleanServerUrl}/api/v2/get_projects`,
      `${cleanServerUrl}/index.php/api/v2/get_projects`
    ]

    for (let i = 0; i < endpoints.length; i++) {
      const url = endpoints[i]
      console.log(`TestRail Test: Trying endpoint ${i + 1}:`, url)

      try {
        const response = await fetch(url, {
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
        })

        console.log(`TestRail Test: Endpoint ${i + 1} response status:`, response.status)
        console.log(`TestRail Test: Endpoint ${i + 1} response headers:`, Object.fromEntries(response.headers.entries()))

        if (response.ok) {
          const projects = await response.json()
          console.log('TestRail Test: Successfully fetched projects:', projects.length)
          return NextResponse.json({
            success: true,
            message: `TestRail connection successful (endpoint ${i + 1})`,
            projectsCount: projects.length,
            projects: projects.slice(0, 3), // Return first 3 projects as sample
            endpointUsed: i + 1
          })
        } else {
          const errorText = await response.text()
          console.error(`TestRail Test: Endpoint ${i + 1} failed:`, errorText)
          
          // If this is the last endpoint and it failed, return the error
          if (i === endpoints.length - 1) {
            let errorMessage = `TestRail API error: ${response.status}`
            
            if (response.status === 401) {
              errorMessage = 'Authentication failed. Please check your email and API key. Make sure your API key is valid and not expired.'
            } else if (response.status === 404) {
              errorMessage = 'TestRail API endpoint not found. Please check your server URL.'
            } else if (response.status === 403) {
              errorMessage = 'Access denied. Please check your API key permissions.'
            }
            
            return NextResponse.json({ 
              error: errorMessage,
              status: response.status,
              url,
              originalError: errorText,
              endpointsTried: endpoints,
              debugInfo: {
                email,
                apiKeyLength: apiKey.length,
                serverUrl: cleanServerUrl,
                authHeaderPreview: authHeader.substring(0, 20) + '...'
              }
            }, { status: 500 })
          }
        }
      } catch (fetchError) {
        console.error(`TestRail Test: Endpoint ${i + 1} fetch error:`, fetchError)
        
        // If this is the last endpoint and it failed, return the error
        if (i === endpoints.length - 1) {
          return NextResponse.json({ 
            error: `TestRail connection failed: ${fetchError}`,
            endpointsTried: endpoints
          }, { status: 500 })
        }
      }
    }

    return NextResponse.json({ 
      error: 'All TestRail endpoints failed' 
    }, { status: 500 })

  } catch (error) {
    console.error('TestRail Test: Connection error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ 
      error: `TestRail connection failed: ${errorMessage}` 
    }, { status: 500 })
  }
} 