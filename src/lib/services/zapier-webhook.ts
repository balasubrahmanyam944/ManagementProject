/**
 * Service to send email verification data to Zapier webhook
 */

interface ZapierWebhookPayload {
  email: string
  verify_link: string
  name?: string
}

// Zapier expects 'to' field for the recipient email
interface ZapierOutputPayload {
  to: string           // Email recipient (what Zapier expects)
  email: string        // Keep for backwards compatibility
  verify_link: string
  name?: string
}

export class ZapierWebhookService {
  private webhookUrl: string

  constructor() {
    this.webhookUrl = process.env.ZAPIER_WEBHOOK_URL || ''
    
    if (!this.webhookUrl) {
      console.warn('ZAPIER_WEBHOOK_URL is not set. Email verification webhook will not be sent.')
    }
  }

  /**
   * Send verification email data to Zapier webhook
   * @param payload - The data to send to Zapier
   * @returns Promise<boolean> - true if successful, false otherwise
   */
  async sendVerificationEmail(payload: ZapierWebhookPayload): Promise<boolean> {
    if (!this.webhookUrl) {
      console.error('❌ Zapier webhook URL is not configured. Set ZAPIER_WEBHOOK_URL in your environment variables.')
      console.error('📧 Email verification payload that would have been sent:', payload)
      return false
    }

    try {
      // Send both 'to' and 'email' for maximum compatibility with Zapier
      const outputPayload: ZapierOutputPayload = {
        to: payload.email,           // What Zapier's email actions typically expect
        email: payload.email,        // Backwards compatibility
        verify_link: payload.verify_link,
        name: payload.name,
      }

      console.log('📤 Sending webhook to Zapier:', {
        url: this.webhookUrl,
        payload: outputPayload,
      })

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(outputPayload),
      })

      const responseText = await response.text()
      let responseData: any = null
      
      try {
        responseData = JSON.parse(responseText)
      } catch {
        // Response is not JSON, that's okay
      }
      
      console.log('📥 Zapier webhook response:', {
        status: response.status,
        statusText: response.statusText,
        body: responseText.substring(0, 200), // First 200 chars
        parsed: responseData,
      })

      if (!response.ok) {
        console.error(`❌ Zapier webhook failed: ${response.status} ${response.statusText}`)
        console.error('Response body:', responseText)
        return false
      }

      // Check if Zapier returned an error in the response body (even with 200 status)
      if (responseData) {
        if (responseData.status === 'error' || responseData.error) {
          console.error('❌ Zapier action error:', responseData.error || responseData.message)
          // If it's a field mapping error, provide helpful guidance
          if (responseData.error?.includes('to') || responseData.error?.includes('Missing')) {
            console.error('💡 Tip: Your Zapier Zap email action needs to be configured to use the "to" field.')
            console.error('   In your Zapier Zap, map the email action\'s "To" field to: {{to}} or {{email}} from Step 1')
          }
          return false
        }
      }

      console.log('✅ Verification email sent via Zapier webhook successfully')
      return true
    } catch (error) {
      console.error('❌ Error sending Zapier webhook:', error)
      if (error instanceof Error) {
        console.error('Error message:', error.message)
        console.error('Error stack:', error.stack)
      }
      return false
    }
  }
}

export const zapierWebhookService = new ZapierWebhookService()

