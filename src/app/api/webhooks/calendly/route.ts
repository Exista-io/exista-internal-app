import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Calendly Webhook Endpoint
 * Handles: invitee.created, invitee.canceled
 * 
 * To set up in Calendly:
 * 1. Go to https://calendly.com/integrations/webhooks
 * 2. Create webhook with URL: https://your-domain.com/api/webhooks/calendly
 * 3. Subscribe to: invitee.created, invitee.canceled
 */

interface CalendlyWebhookPayload {
    event: 'invitee.created' | 'invitee.canceled'
    created_at: string
    created_by: string
    payload: {
        uri: string
        email: string
        name: string
        first_name?: string
        last_name?: string
        status: string
        timezone: string
        event: string // URI to scheduled event
        cancel_url: string
        reschedule_url: string
        scheduled_event?: {
            uri: string
            name: string
            start_time: string
            end_time: string
            event_type: string
        }
        questions_and_answers?: Array<{
            question: string
            answer: string
        }>
    }
}

export async function POST(request: NextRequest) {
    try {
        const payload = await request.json() as CalendlyWebhookPayload

        console.log('[Calendly Webhook] Event:', payload.event, payload.payload.email)

        const supabase = await createClient()
        const invitee = payload.payload

        // Find lead by email
        const { data: lead } = await supabase
            .from('leads')
            .select('id, outreach_status, contact_name')
            .eq('contact_email', invitee.email.toLowerCase())
            .single()

        const leadId = lead?.id || null

        if (payload.event === 'invitee.created') {
            // Create meeting record
            const { error: meetingError } = await supabase.from('meetings').insert({
                lead_id: leadId,
                invitee_email: invitee.email.toLowerCase(),
                invitee_name: invitee.name,
                invitee_timezone: invitee.timezone,
                calendly_event_uri: invitee.event,
                scheduled_at: invitee.scheduled_event?.start_time || null,
                meeting_type: invitee.scheduled_event?.name || null,
                status: 'scheduled',
                cancel_url: invitee.cancel_url,
                reschedule_url: invitee.reschedule_url,
                calendly_payload: payload,
            })

            if (meetingError) {
                console.error('[Calendly Webhook] Error creating meeting:', meetingError)
            }

            // Update lead status if found
            if (leadId) {
                await supabase
                    .from('leads')
                    .update({
                        outreach_status: 'meeting_booked',
                        next_action_at: invitee.scheduled_event?.start_time || null,
                        next_action_type: 'meeting',
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', leadId)

                // Log the activity
                await supabase.from('outreach_logs').insert({
                    lead_id: leadId,
                    action_type: 'meeting_booked',
                    channel: 'calendly',
                    message_preview: `Meeting scheduled: ${invitee.scheduled_event?.name || 'Call'}`,
                    success: true,
                })
            }

            console.log('[Calendly Webhook] Meeting created', leadId ? `for lead ${leadId}` : '(no lead found)')

        } else if (payload.event === 'invitee.canceled') {
            // Update meeting status
            await supabase
                .from('meetings')
                .update({
                    status: 'cancelled',
                    updated_at: new Date().toISOString(),
                })
                .eq('calendly_event_uri', invitee.event)
                .eq('invitee_email', invitee.email.toLowerCase())

            // Update lead status if found
            if (leadId) {
                await supabase
                    .from('leads')
                    .update({
                        outreach_status: 'intro_opened', // Revert to previous engaged status
                        next_action_at: null,
                        next_action_type: null,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', leadId)

                await supabase.from('outreach_logs').insert({
                    lead_id: leadId,
                    action_type: 'meeting_cancelled',
                    channel: 'calendly',
                    message_preview: 'Meeting cancelled by invitee',
                    success: false,
                })
            }

            console.log('[Calendly Webhook] Meeting cancelled', leadId ? `for lead ${leadId}` : '')
        }

        return NextResponse.json({ received: true, processed: payload.event })

    } catch (error) {
        console.error('[Calendly Webhook] Error:', error)
        return NextResponse.json(
            { error: 'Webhook processing failed' },
            { status: 500 }
        )
    }
}

// Calendly sends GET to verify endpoint
export async function GET() {
    return NextResponse.json({ status: 'ok', endpoint: 'calendly-webhook' })
}
