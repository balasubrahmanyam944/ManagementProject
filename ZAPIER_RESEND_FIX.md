# Fix: Zapier "Missing 'to' field" Error

## Problem
Your Zapier Zap is receiving the webhook correctly, but the Resend API step is failing with "Missing 'to' field" error, even though the payload shows `"to": "test@example.com"`.

## Root Cause
The Resend API action in Zapier is not properly mapping the `email` field from the webhook trigger to the `to` field in the Resend API request.

## Solution: Fix Zapier Configuration

### Step 1: Edit Your Zap
1. Go to [Zapier Dashboard](https://zapier.com/app/zaps)
2. Click on "Untitled Zap" (or your Zap name)
3. Click "Edit draft" or "Edit" button

### Step 2: Configure the Resend API Action (Step 2: POST)

1. **Click on Step 2: POST** to edit it

2. **In the "URL" field:**
   ```
   https://api.resend.com/emails
   ```

3. **In the "Method" dropdown:**
   Select: `POST`

4. **In the "Headers" section:**
   Add these headers:
   ```
   Authorization: Bearer re_YOUR_RESEND_API_KEY
   Content-Type: application/json
   ```

5. **In the "Data (JSON)" field - THIS IS CRITICAL:**
   
   You need to use Zapier's dynamic data picker to map the email from Step 1.
   
   **IMPORTANT:** Don't just type `{{email}}` - you must use Zapier's data picker!
   
   Click the field where you need to enter the email, then:
   - Click the dropdown/icon that appears
   - Select "1. Catch Hook" from the list
   - Select "email" from the available fields
   - This will insert the proper mapping: `{{1_email}}` or similar
   
   **Correct JSON Body:**
   ```json
   {
     "from": "Your App <balu.suntech@gmail.com>",
     "to": "{{1_email}}",
     "subject": "Verify your email",
     "html": "<!DOCTYPE html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1.0'><title>Verify Your Email</title></head><body style='font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;'><div style='background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;'><h1 style='color: white; margin: 0;'>Verify Your Email</h1></div><div style='background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;'><p style='font-size: 16px; margin-bottom: 20px;'>Thank you for signing up! Please verify your email address by clicking the button below.</p><div style='text-align: center; margin: 30px 0;'><a href='{{1_verify_link}}' style='background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;'>Verify Email</a></div><p style='font-size: 14px; color: #666; margin-top: 30px;'>If the button doesn't work, copy and paste this link into your browser:</p><p style='font-size: 12px; color: #999; word-break: break-all;'>{{1_verify_link}}</p><p style='font-size: 14px; color: #666; margin-top: 30px;'>This link will expire in 24 hours.</p><p style='font-size: 14px; color: #666; margin-top: 20px;'>If you didn't create an account, you can safely ignore this email.</p></div></body></html>"
   }
   ```

   **Key Points:**
   - Use `{{1_email}}` for the email (where `1` refers to Step 1: Catch Hook)
   - Use `{{1_verify_link}}` for the verification link
   - Use `{{1_name}}` if you want to include the name (optional)

6. **Test the Step:**
   - Click "Test step" or "Continue"
   - Zapier will use the data from Step 1 to test
   - You should see the email being sent successfully

### Step 3: Verify Field Mapping

If the dynamic picker doesn't work, check what fields are available:

1. In Step 2, when editing the JSON body
2. Click in the `"to"` field
3. Look for a dropdown or icon that says "Insert data"
4. You should see fields from Step 1:
   - `email` (from webhook)
   - `verify_link` (from webhook)
   - `name` (from webhook)

5. Select the `email` field - this will properly map it

### Step 4: Alternative - Use "Data Pass-Through" Format

If Zapier's field mapping is confusing, you can also use this format:

```json
{
  "from": "Your App <balu.suntech@gmail.com>",
  "to": "{{email}}",
  "subject": "Verify your email",
  "html": "<p>Click below to verify your email:</p><a href='{{verify_link}}'>Verify Email</a>"
}
```

But make sure you're using Zapier's data picker, not just typing `{{email}}` manually.

### Step 5: Save and Turn On

1. Click "Save" or "Continue"
2. Turn the Zap ON (toggle switch)
3. Test by signing up a new user

## Verification Checklist

After fixing:
- [ ] Zap is turned ON
- [ ] Step 2 uses `{{1_email}}` or properly mapped email field
- [ ] Step 2 uses `{{1_verify_link}}` or properly mapped verify_link field
- [ ] Test step succeeds in Zapier
- [ ] Check Resend dashboard - should show sent emails
- [ ] Check email inbox (and spam folder)

## Common Mistakes

1. **Typing `{{email}}` manually** - Must use Zapier's data picker
2. **Wrong field name** - Use `{{1_email}}` not `{{email}}` (the `1` refers to step number)
3. **JSON syntax error** - Make sure JSON is valid
4. **Missing Authorization header** - Must include `Bearer re_YOUR_API_KEY`

## Testing

After fixing, test by:
1. Going to `/gmail/debug-zapier`
2. Click "Test Zapier Webhook"
3. Check Zapier history - should show success
4. Check Resend dashboard - should show sent email
5. Check your email inbox

If it still fails, check the Zapier error details for the exact field name that's missing.

