import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Resend Webhook Endpoint
 * Handles email events: opened, clicked, bounced, etc.
 */

interface ResendWebhookPayload {
    type: 'email.sent' | 'email.delivered' | 'email.delivery_delayed' |
    'email.opened' | 'email.clicked' | 'email.bounced' | 'email.complained'
    created_at: string
    data: {
        email_id: string
        from: string
        to: string[]
        subject: string
        tags?: Array<{ name: string; value: string }>
    }
}

export async function POST(request: NextRequest) {
    try {
        const payload = await request.json() as ResendWebhookPayload

        console.log('[Resend Webhook] Event:', payload.type, payload.data.email_id)

        // Extract lead_id from tags
        const leadIdTag = payload.data.tags?.find(t => t.name === 'lead_id')
        const leadId = leadIdTag?.value

        if (!leadId) {
            console.log('[Resend Webhook] No lead_id in tags, skipping')
            return NextResponse.json({ received: true })
        }

        const supabase = await createClient()

        // Get current lead stats
        const { data: lead } = await supabase
            .from('leads')
            .select('email_opens, email_clicks, outreach_status')
            .eq('id', leadId)
            .single()

        if (!lead) {
            console.log('[Resend Webhook] Lead not found:', leadId)
            return NextResponse.json({ received: true, error: 'Lead not found' })
        }

        // Handle different event types
        switch (payload.type) {
            case 'email.opened':
                await supabase
                    .from('leads')
                    .update({
                        email_opens: (lead.email_opens || 0) + 1,
                        outreach_status: lead.outreach_status === 'intro_sent'
                            ? 'intro_opened'
                            : lead.outreach_status,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', leadId)

                await supabase.from('outreach_logs').insert({
                    lead_id: leadId,
                    action_type: 'email_opened',
                    channel: 'email',
                    message_preview: payload.data.subject,
                    success: true,
                })
                break

            case 'email.clicked':
                await supabase
                    .from('leads')
                    .update({
                        email_clicks: (lead.email_clicks || 0) + 1,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', leadId)

                await supabase.from('outreach_logs').insert({
                    lead_id: leadId,
                    action_type: 'email_clicked',
                    channel: 'email',
                    message_preview: payload.data.subject,
                    success: true,
                })
                break

            case 'email.bounced':
                await supabase
                    .from('leads')
                    .update({
                        outreach_status: 'disqualified',
                        notes: `Email bounced: ${payload.data.to.join(', ')}`,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', leadId)

                await supabase.from('outreach_logs').insert({
                    lead_id: leadId,
                    action_type: 'email_bounced',
                    channel: 'email',
                    message_preview: payload.data.subject,
                    success: false,
                    error_message: 'Email bounced',
                })
                break

            case 'email.complained':
                await supabase
                    .from('leads')
                    .update({
                        outreach_status: 'disqualified',
                        notes: `Marked as spam by recipient`,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', leadId)

                await supabase.from('outreach_logs').insert({
                    lead_id: leadId,
                    action_type: 'email_complained',
                    channel: 'email',
                    message_preview: payload.data.subject,
                    success: false,
                    error_message: 'Marked as spam',
                })
                break

            default:
                console.log('[Resend Webhook] Ignoring event type:', payload.type)
        }

        return NextResponse.json({ received: true, processed: payload.type })

    } catch (error) {
        console.error('[Resend Webhook] Error:', error)
        return NextResponse.json(
            { error: 'Webhook processing failed' },
            { status: 500 }
        )
    }
}

// Resend sends GET to verify endpoint
export async function GET() {
    return NextResponse.json({ status: 'ok', endpoint: 'resend-webhook' })
}
