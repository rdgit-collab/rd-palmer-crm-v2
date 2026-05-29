/**
 * notifyUser — creates an in-app notification and optionally sends an email.
 *
 * @param {object} supabase  - Supabase client
 * @param {object} opts
 * @param {number|string} opts.userId   - Legacy integer user id of the recipient
 * @param {string} opts.title    - Short notification title
 * @param {string} opts.body     - Longer description
 * @param {string} opts.link     - Route to navigate to (e.g. '/tickets')
 */
export async function notifyUser(supabase, { userId, title, body, link }) {
  if (!userId) return

  // 1. Insert in-app notification
  await supabase.from('notification').insert([{ user_id: userId, title, body, link }])

  // 2. Try to send email (fails silently if Edge Function / API key not configured)
  try {
    const { data: userRow } = await supabase
      .from('users')
      .select('email, first_name')
      .eq('old_user_id', userId)
      .single()

    if (userRow?.email) {
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
                <h2 style="margin:0 0 8px;font-size:18px;color:#111;">${title}</h2>
                <p style="margin:0;color:#555;font-size:14px;line-height:1.6;">${body}</p>
                <div style="margin-top:24px;">
                  <a href="${import.meta.env.VITE_APP_URL || 'https://crm.rd-palmer.my'}${link || ''}"
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
