/**
 * notifyUser — creates an in-app notification and optionally sends an email.
 *
 * @param {object} supabase  - Supabase client
 * @param {object} opts
 * @param {number|string} opts.userId   - Legacy integer user id of the recipient
 * @param {string} opts.title    - Short notification title
 * @param {string} opts.body     - Longer description
 * @param {string} opts.link     - Route to navigate to (e.g. '/tickets')
 * @param {string} opts.companyName - Company/customer name shown in the bell
 * @param {string} opts.reference - Short record reference shown in the bell
 * @param {number|string} opts.actorUserId - Legacy integer user id of the sender/creator
 * @param {Array<{label:string,value:string}>} opts.details - Detail rows for bell/email
 */
function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]))
}

function normalizeDetails(details = []) {
  return details
    .map(item => Array.isArray(item)
      ? { label: item[0], value: item[1] }
      : item
    )
    .filter(item => item?.label && item?.value !== undefined && item?.value !== null && item?.value !== '')
}

export async function notifyUser(supabase, {
  userId,
  title,
  body,
  link,
  companyName = '',
  reference = '',
  actorUserId = null,
  details = [],
}) {
  if (!userId) return

  const now = new Date()
  const detailRows = normalizeDetails(details)
  const detailText = detailRows.map(item => `${item.label}: ${item.value}`).join('\n')
  const description = [body, detailText].filter(Boolean).join('\n')

  // 1. Insert in-app notification. Never block the main save flow if this fails.
  const { error: notificationError } = await supabase.from('notification').insert([{
    user_id: actorUserId || userId,
    assigned_to: userId,
    company_name: companyName || '',
    description: description || title || '',
    reference: reference || title || link || '',
    status: title || null,
    link: link || null,
    date: now.toISOString().split('T')[0],
    time: now.toTimeString().slice(0, 5),
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  }])
  if (notificationError) {
    console.warn('Notification insert failed:', notificationError.message)
  }

  // 2. Try to send browser push (fails silently if Edge Function / VAPID keys are not configured)
  if (import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY) {
    supabase.functions.invoke('send-web-push-notification', {
      body: {
        userId,
        title,
        body,
        link,
        companyName,
        reference,
      },
    }).catch(() => {})
  }

  // 3. Try to send email (fails silently if Edge Function / API key not configured)
  try {
    const { data: userRow } = await supabase
      .from('users')
      .select('email, first_name')
      .eq('old_user_id', userId)
      .single()

    if (userRow?.email) {
      const detailsHtml = detailRows.length
        ? `
                <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:13px;">
                  <tbody>
                    ${detailRows.map(item => `
                      <tr>
                        <td style="padding:6px 8px;border:1px solid #eee;color:#777;width:34%;">${escapeHtml(item.label)}</td>
                        <td style="padding:6px 8px;border:1px solid #eee;color:#222;">${escapeHtml(item.value)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>`
        : ''

      await supabase.functions.invoke('send-notification-email', {
        body: {
          to_email: userRow.email,
          to_name:  userRow.first_name || '',
          subject:  title,
          body_html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
              <div style="background:#CC0000;padding:16px 24px;">
                <span style="color:#fff;font-weight:700;font-size:16px;">RD Palmer CRM</span>
              </div>
              <div style="padding:24px;border:1px solid #E0E0E0;border-top:none;">
                <h2 style="margin:0 0 8px;font-size:18px;color:#111;">${escapeHtml(title)}</h2>
                ${companyName ? `<p style="margin:0 0 8px;color:#111;font-size:14px;font-weight:600;">${escapeHtml(companyName)}</p>` : ''}
                <p style="margin:0;color:#555;font-size:14px;line-height:1.6;">${escapeHtml(body || '').replace(/\n/g, '<br>')}</p>
                ${detailsHtml}
                <div style="margin-top:24px;">
                  <a href="${escapeHtml(import.meta.env.VITE_APP_URL || 'https://crm.rd-palmer.my')}${escapeHtml(link || '')}"
                     style="background:#CC0000;color:#fff;padding:10px 20px;text-decoration:none;font-size:14px;border-radius:4px;">
                    View in CRM
                  </a>
                </div>
              </div>
              <p style="padding:0 24px;font-size:11px;color:#aaa;">RD Palmer Sdn Bhd · This is an automated notification.</p>
            </div>
          `,
        },
      })
    }
  } catch (_) {
    // Email is best-effort — never block the main save flow
  }
}
