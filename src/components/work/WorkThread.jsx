import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Paperclip, Search, Send, Users, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { notifyUser } from '../../lib/notifyUser'
import { fetchAssignableUsers, getLegacyUserId, getUserName } from '../../lib/legacyUsers'
import { displayText } from '../../lib/displayText'
import SignedFileLink from '../SignedFileLink'
import {
  formatThreadTime,
  isMissingWorkThreadTable,
  safeStorageName,
  validateWorkThreadFiles,
  workThreadLink,
} from '../../lib/workThreads'

const MESSAGE_LIMIT = 100

function initialsFor(name = '') {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  return (parts[0]?.[0] || '') + (parts[1]?.[0] || '')
}

function fileNameFromPath(path = '') {
  return String(path || '').split('/').pop() || 'Attachment'
}

function formatUserName(user) {
  return `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || 'Unnamed user'
}

export default function WorkThread({
  recordType,
  recordId,
  title,
  reference,
  companyName = '',
  link,
  className = '',
  showHeader = true,
}) {
  const { profile } = useAuth()
  const [thread, setThread] = useState(null)
  const [messages, setMessages] = useState([])
  const [users, setUsers] = useState([])
  const [draft, setDraft] = useState('')
  const [notifyIds, setNotifyIds] = useState([])
  const [notifySearch, setNotifySearch] = useState('')
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)

  const currentOldUserId = getLegacyUserId(profile)
  const threadLink = link || (thread ? workThreadLink(thread) : '')

  const userName = useCallback((oldUserId) => {
    return displayText(getUserName(users, oldUserId), 'System')
  }, [users])

  const notifyUsers = useMemo(() => users.filter(user =>
    String(user.id) !== String(currentOldUserId || '')
  ), [currentOldUserId, users])

  const selectedNotifyUsers = useMemo(() => notifyIds
    .map(id => notifyUsers.find(user => String(user.id) === String(id)))
    .filter(Boolean), [notifyIds, notifyUsers])

  const filteredNotifyUsers = useMemo(() => {
    const term = notifySearch.trim().toLowerCase()
    const selected = new Set(notifyIds.map(String))
    return notifyUsers
      .filter(user => !selected.has(String(user.id)))
      .filter(user => {
        if (!term) return true
        const haystack = `${formatUserName(user)} ${user.id}`.toLowerCase()
        return haystack.includes(term)
      })
      .slice(0, 8)
  }, [notifyIds, notifySearch, notifyUsers])

  const addNotifyUser = (userId) => {
    const nextId = String(userId)
    setNotifyIds(prev => prev.includes(nextId) ? prev : [...prev, nextId])
    setNotifySearch('')
  }

  const removeNotifyUser = (userId) => {
    const nextId = String(userId)
    setNotifyIds(prev => prev.filter(id => id !== nextId))
  }

  const loadMessages = useCallback(async (threadId) => {
    const { data, error: messageError } = await supabase
      .from('work_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
      .limit(MESSAGE_LIMIT)

    if (messageError) {
      if (isMissingWorkThreadTable(messageError)) setUnavailable(true)
      else setError(messageError.message)
      return
    }
    setMessages(data || [])
  }, [])

  const markRead = useCallback(async (threadId) => {
    if (!threadId || !currentOldUserId) return
    await supabase
      .from('work_thread_reads')
      .upsert([{
        thread_id: threadId,
        user_old_user_id: currentOldUserId,
        last_read_at: new Date().toISOString(),
      }], { onConflict: 'thread_id,user_old_user_id' })
  }, [currentOldUserId])

  const ensureThread = useCallback(async () => {
    if (!recordType || !recordId || !profile?.id) return
    setLoading(true)
    setError('')
    setUnavailable(false)

    const { data: existingThread, error: lookupError } = await supabase
      .from('work_threads')
      .select('*')
      .eq('record_type', recordType)
      .eq('record_id', String(recordId))
      .maybeSingle()

    if (lookupError) {
      if (isMissingWorkThreadTable(lookupError)) setUnavailable(true)
      else setError(lookupError.message)
      setLoading(false)
      return
    }

    let data = existingThread
    if (!data) {
      const payload = {
        record_type: recordType,
        record_id: String(recordId),
        title: title || reference || null,
        reference: reference || title || null,
        company_name: companyName || null,
        created_by: profile.id,
        created_by_old_user_id: currentOldUserId,
      }

      const { data: insertedThread, error: insertThreadError } = await supabase
        .from('work_threads')
        .insert([payload])
        .select('*')
        .single()

      if (insertThreadError?.code === '23505') {
        const { data: racedThread, error: racedLookupError } = await supabase
          .from('work_threads')
          .select('*')
          .eq('record_type', recordType)
          .eq('record_id', String(recordId))
          .maybeSingle()
        if (racedLookupError) {
          setError(racedLookupError.message)
          setLoading(false)
          return
        }
        data = racedThread
      } else if (insertThreadError) {
        if (isMissingWorkThreadTable(insertThreadError)) setUnavailable(true)
        else setError(insertThreadError.message)
        setLoading(false)
        return
      } else {
        data = insertedThread
      }
    } else if (
      (title || reference || companyName) &&
      (data.title !== (title || reference || null) ||
        data.reference !== (reference || title || null) ||
        data.company_name !== (companyName || null))
    ) {
      supabase.from('work_threads').update({
        title: title || reference || null,
        reference: reference || title || null,
        company_name: companyName || null,
        updated_at: new Date().toISOString(),
      }).eq('id', data.id).then(({ data: updatedRows }) => {
        if (updatedRows?.[0]) setThread(updatedRows[0])
      })
    }

    if (!data) {
      setError('Unable to open discussion thread.')
      setLoading(false)
      return
    }

    const { data: latestThread } = await supabase
      .from('work_threads')
      .select('*')
      .eq('id', data.id)
      .maybeSingle()

    setThread(latestThread || data)
    await loadMessages(data.id)
    await markRead(data.id)
    setLoading(false)
  }, [companyName, currentOldUserId, loadMessages, markRead, profile?.id, recordId, recordType, reference, title])

  useEffect(() => {
    fetchAssignableUsers(supabase).then(setUsers)
  }, [])

  useEffect(() => {
    ensureThread()
  }, [ensureThread])

  useEffect(() => {
    if (!thread?.id) return
    const channel = supabase
      .channel(`work-thread-${thread.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'work_messages', filter: `thread_id=eq.${thread.id}` },
        (payload) => {
          setMessages(prev => prev.some(item => item.id === payload.new.id)
            ? prev
            : [...prev.slice(-(MESSAGE_LIMIT - 1)), payload.new]
          )
          markRead(thread.id)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [markRead, thread?.id])

  const handleFiles = (selectedFiles) => {
    const next = Array.from(selectedFiles || [])
    const validationError = validateWorkThreadFiles(next)
    if (validationError) {
      setError(validationError)
      return
    }
    setFiles(next)
    setError('')
  }

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, itemIndex) => itemIndex !== index))
  }

  const sendMessage = async (event) => {
    event.preventDefault()
    if (!thread?.id || saving) return

    const body = draft.trim()
    const mentionedIds = notifyIds
      .map(id => parseInt(id))
      .filter(id => Number.isFinite(id) && String(id) !== String(currentOldUserId || ''))
    const mentionedUsers = mentionedIds
      .map(id => notifyUsers.find(user => String(user.id) === String(id)))
      .filter(Boolean)
    const mentionPrefix = mentionedUsers.map(user => `@${formatUserName(user)}`).join(' ')
    const messageBody = [mentionPrefix, body].filter(Boolean).join(' ').trim()

    if (!messageBody && files.length === 0) {
      setError('Type a message or attach a file first.')
      return
    }

    const validationError = validateWorkThreadFiles(files)
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    setError('')
    const uploadedPaths = []

    for (const file of files) {
      const filePath = `work-thread/${recordType}/${String(recordId)}/${Date.now()}-${uploadedPaths.length}-${safeStorageName(file.name)}`
      const { error: uploadError } = await supabase.storage
        .from('crm-uploads')
        .upload(filePath, file, { upsert: false })

      if (uploadError) {
        if (uploadedPaths.length) {
          await supabase.storage.from('crm-uploads').remove(uploadedPaths).catch(() => {})
        }
        setError(uploadError.message)
        setSaving(false)
        return
      }
      uploadedPaths.push(filePath)
    }

    const { data: inserted, error: insertError } = await supabase
      .from('work_messages')
      .insert([{
        thread_id: thread.id,
        body: messageBody || null,
        attachment_paths: uploadedPaths,
        mentioned_old_user_ids: mentionedIds,
        created_by: profile?.id || null,
        created_by_old_user_id: currentOldUserId,
      }])
      .select('*')
      .single()

    if (insertError) {
      if (uploadedPaths.length) {
        await supabase.storage.from('crm-uploads').remove(uploadedPaths).catch(() => {})
      }
      setError(insertError.message)
      setSaving(false)
      return
    }

    setMessages(prev => prev.some(item => item.id === inserted.id) ? prev : [...prev, inserted])
    setDraft('')
    setFiles([])
    setNotifyIds([])
    setNotifySearch('')
    if (fileInputRef.current) fileInputRef.current.value = ''
    await markRead(thread.id)

    const senderName = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || 'A user'
    await Promise.allSettled(mentionedIds.map(userId => notifyUser(supabase, {
      userId,
      actorUserId: currentOldUserId,
      title: 'New discussion message',
      reference: reference || title || 'Work discussion',
      companyName,
      sendEmail: false,
      body: `${senderName}: ${messageBody || `${uploadedPaths.length} attachment${uploadedPaths.length !== 1 ? 's' : ''}`}`,
      details: [
        ['Record', reference || title || `${recordType} #${recordId}`],
        ['Company', companyName || ''],
      ],
      link: threadLink,
    })))

    setSaving(false)
  }

  if (unavailable) {
    return (
      <div className={`border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 ${className}`}>
        Work discussion is ready in the app, but the database update has not been applied yet.
      </div>
    )
  }

  return (
    <div className={`${showHeader ? 'border-t border-gray-100 pt-5' : ''} ${className}`}>
      {showHeader && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Discussion</p>
            <p className="mt-1 text-sm text-gray-500">Record-linked messages stay with this work item.</p>
          </div>
          <span className="text-xs text-gray-400">{messages.length} message{messages.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {loading ? (
        <div className="py-6 text-sm text-gray-400">Loading discussion...</div>
      ) : (
        <>
          <div className="max-h-96 overflow-y-auto border border-gray-200 bg-gray-50/60">
            {messages.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">No discussion yet.</div>
            ) : (
              <div className="space-y-3 p-3">
                {messages.map(message => {
                  const author = userName(message.created_by_old_user_id)
                  const attachments = Array.isArray(message.attachment_paths) ? message.attachment_paths : []
                  const isOwnMessage = String(message.created_by_old_user_id || '') === String(currentOldUserId || '')
                  return (
                    <div key={message.id} className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[92%] border px-3 py-2 sm:max-w-[82%] ${
                        isOwnMessage
                          ? 'border-[#CC0000] bg-[#CC0000] text-white'
                          : 'border-gray-200 bg-white text-gray-700'
                      }`}>
                        <div className="mb-1 flex items-center gap-2">
                          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                            isOwnMessage ? 'bg-white text-[#CC0000]' : 'bg-gray-900 text-white'
                          }`}>
                            {initialsFor(author) || '?'}
                          </span>
                          <div className="min-w-0">
                            <p className={`truncate text-sm font-medium ${isOwnMessage ? 'text-white' : 'text-gray-900'}`}>{author}</p>
                            <p className={`text-xs ${isOwnMessage ? 'text-red-100' : 'text-gray-400'}`}>{formatThreadTime(message.created_at)}</p>
                          </div>
                        </div>
                        {message.body && (
                          <p className={`mt-2 whitespace-pre-wrap text-sm ${isOwnMessage ? 'text-white' : 'text-gray-700'}`}>{message.body}</p>
                        )}
                        {attachments.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {attachments.map(path => (
                              <div key={path} className="text-sm">
                                <SignedFileLink
                                  path={path}
                                  label={fileNameFromPath(path)}
                                  className={isOwnMessage ? 'text-white underline hover:text-red-100' : 'text-red-600 hover:underline'}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <form onSubmit={sendMessage} className="mt-3 space-y-3">
            {error && <div className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

            <textarea
              value={draft}
              onChange={event => setDraft(event.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Write an update..."
              className="w-full resize-none border border-gray-200 px-3 py-2 text-sm focus:border-red-400 focus:outline-none"
            />

            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr),220px]">
              <div className="border border-gray-200">
                <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-2">
                  <span className="inline-flex items-center gap-2 text-xs font-medium text-gray-500">
                    <Users size={14} /> Tag users
                  </span>
                  {selectedNotifyUsers.length > 0 && (
                    <span className="text-xs text-gray-400">{selectedNotifyUsers.length} selected</span>
                  )}
                </div>
                <div className="space-y-2 p-2">
                  {notifyUsers.length === 0 ? (
                    <p className="px-1 py-2 text-xs text-gray-400">No active users available.</p>
                  ) : (
                    <>
                      {selectedNotifyUsers.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {selectedNotifyUsers.map(user => (
                            <span key={user.id} className="inline-flex max-w-full items-center gap-1 border border-red-100 bg-red-50 px-2 py-1 text-xs text-red-700">
                              <span className="truncate">@{formatUserName(user)}</span>
                              <button
                                type="button"
                                onClick={() => removeNotifyUser(user.id)}
                                className="text-red-400 hover:text-red-700"
                                title={`Remove ${formatUserName(user)}`}
                              >
                                <X size={12} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-2 border border-gray-200 px-2 py-1.5 focus-within:border-red-300">
                        <Search size={14} className="shrink-0 text-gray-400" />
                        <input
                          type="search"
                          value={notifySearch}
                          onChange={event => setNotifySearch(event.target.value)}
                          placeholder="Search user name..."
                          className="min-w-0 flex-1 bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-400"
                        />
                      </div>

                      <div className="max-h-32 overflow-y-auto">
                        {filteredNotifyUsers.length === 0 ? (
                          <p className="px-2 py-2 text-xs text-gray-400">No matching users.</p>
                        ) : filteredNotifyUsers.map(user => (
                          <button
                            key={user.id}
                            type="button"
                            onClick={() => addNotifyUser(user.id)}
                            className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <span className="min-w-0 truncate">{formatUserName(user)}</span>
                            <span className="shrink-0 text-xs text-gray-400">Tag</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex cursor-pointer items-center justify-center gap-2 border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  <Paperclip size={14} />
                  Attach files
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={event => handleFiles(event.target.files)}
                  />
                </label>
                <p className="text-xs text-gray-400">Max 3 files, 10 MB each.</p>
              </div>
            </div>

            {files.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {files.map((file, index) => (
                  <span key={`${file.name}-${index}`} className="inline-flex max-w-full items-center gap-1 border border-gray-200 px-2 py-1 text-xs text-gray-600">
                    <span className="truncate">{file.name}</span>
                    <button type="button" onClick={() => removeFile(index)} className="text-gray-400 hover:text-red-600" title="Remove file">
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 bg-[#CC0000] px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Send size={14} /> {saving ? 'Sending...' : 'Send'}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  )
}
