import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays, Check, ChevronLeft, ChevronRight, Edit, MapPin,
  Package, Plus, Search, X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { getLegacyUserId } from '../lib/legacyUsers'
import { hasAdminAccess } from '../lib/roles'
import { logActivity } from '../lib/activityLog'

const statusStyles = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-600',
  completed: 'bg-blue-100 text-blue-700',
}

const itemStatusStyles = {
  available: 'bg-green-50 text-green-700 border-green-100',
  booked: 'bg-amber-50 text-amber-700 border-amber-100',
  under_repair: 'bg-red-50 text-red-700 border-red-100',
  missing: 'bg-red-50 text-red-700 border-red-100',
  check_required: 'bg-orange-50 text-orange-700 border-orange-100',
}

const selectableItemStatuses = new Set(['available'])

const purposeOptions = ['Demo', 'Rental', 'Internal Use', 'Meeting', 'Training', 'Customer Visit', 'Other']

const emptyForm = {
  booking_type: 'venue',
  venue_id: '',
  purpose: 'Demo',
  customer_name: '',
  start_at: '',
  end_at: '',
  notes: '',
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function localInputValue(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function monthLabel(date) {
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

function monthRange(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1)
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1)
  return { start, end }
}

function calendarDays(date) {
  const { start, end } = monthRange(date)
  const first = new Date(start)
  first.setDate(first.getDate() - first.getDay())
  const days = []
  const cursor = new Date(first)
  while (cursor < end || days.length % 7 !== 0) {
    days.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function displayName(user) {
  if (!user) return '—'
  return [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.email || '—'
}

function bookingTitle(booking, { venuesById, itemsByBooking }) {
  if (booking.booking_type === 'venue') {
    return venuesById[String(booking.venue_id)]?.name || 'Venue booking'
  }
  const items = itemsByBooking[String(booking.id)] || []
  if (!items.length) return 'Equipment booking'
  return items.length === 1 ? items[0].name : `${items[0].name} +${items.length - 1}`
}

function statusLabel(value) {
  if (value === 'approved') return 'active'
  return String(value || 'pending').replace(/_/g, ' ')
}

function isClosedBooking(booking) {
  return ['cancelled', 'completed'].includes(booking?.status)
}

export default function Booking() {
  const { profile } = useAuth()
  const isAdmin = hasAdminAccess(profile?.role_id)

  const [activeTab, setActiveTab] = useState('equipment')
  const [month, setMonth] = useState(() => new Date())
  const [bookings, setBookings] = useState([])
  const [bookingItems, setBookingItems] = useState([])
  const [venues, setVenues] = useState([])
  const [categories, setCategories] = useState([])
  const [groups, setGroups] = useState([])
  const [equipmentItems, setEquipmentItems] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editingBooking, setEditingBooking] = useState(null)
  const [selectedItems, setSelectedItems] = useState([])
  const [categoryFilter, setCategoryFilter] = useState('')
  const [equipmentSearch, setEquipmentSearch] = useState('')
  const [selectedCalendarBookingId, setSelectedCalendarBookingId] = useState(null)
  const [showAllBookings, setShowAllBookings] = useState(false)
  const [unavailableItemIds, setUnavailableItemIds] = useState([])
  const [checkingAvailability, setCheckingAvailability] = useState(false)

  const usersById = useMemo(() => Object.fromEntries(users.map(user => [String(user.id), user])), [users])
  const venuesById = useMemo(() => Object.fromEntries(venues.map(venue => [String(venue.id), venue])), [venues])
  const itemsById = useMemo(() => Object.fromEntries(equipmentItems.map(item => [item.id, item])), [equipmentItems])
  const categoriesById = useMemo(() => Object.fromEntries(categories.map(category => [category.id, category])), [categories])
  const unavailableItemSet = useMemo(() => new Set(unavailableItemIds), [unavailableItemIds])

  const itemsByBooking = useMemo(() => {
    const map = {}
    bookingItems.forEach(row => {
      const item = itemsById[row.equipment_item_id]
      if (!item) return
      if (!map[String(row.booking_id)]) map[String(row.booking_id)] = []
      map[String(row.booking_id)].push(item)
    })
    return map
  }, [bookingItems, itemsById])

  const visibleBookings = useMemo(
    () => bookings.filter(booking => booking.booking_type === activeTab && !isClosedBooking(booking)),
    [bookings, activeTab],
  )

  const listBookings = useMemo(() => {
    if (showAllBookings) return visibleBookings
    if (!selectedCalendarBookingId) return []
    return visibleBookings.filter(booking => String(booking.id) === String(selectedCalendarBookingId))
  }, [selectedCalendarBookingId, showAllBookings, visibleBookings])

  useEffect(() => {
    setSelectedCalendarBookingId(null)
    setShowAllBookings(false)
  }, [activeTab, month])

  const selectedEquipmentItems = useMemo(
    () => selectedItems.map(itemId => itemsById[itemId]).filter(Boolean),
    [itemsById, selectedItems],
  )

  const filteredGroups = useMemo(() => {
    const term = equipmentSearch.trim().toLowerCase()
    return groups
      .filter(group => !categoryFilter || group.category_id === categoryFilter)
      .map(group => {
        const items = equipmentItems.filter(item => item.group_id === group.id)
        const matchesGroup = !term || `${group.name} ${group.booking_rule || ''}`.toLowerCase().includes(term)
        const matchedItems = items.filter(item => {
          if (!term || matchesGroup) return true
          return `${item.name} ${item.serial_no || ''} ${item.location || ''}`.toLowerCase().includes(term)
        })
        return { ...group, items: matchedItems, allItems: items }
      })
      .filter(group => group.items.length > 0 || (!term && group.allItems.length > 0))
  }, [categoryFilter, equipmentItems, equipmentSearch, groups])

  const isItemUnavailable = useCallback(
    item => !selectableItemStatuses.has(item.status) || unavailableItemSet.has(item.id),
    [unavailableItemSet],
  )

  const completeExpiredBookings = useCallback(async (rows = []) => {
    const nowIso = new Date().toISOString()
    const expiredIds = rows
      .filter(booking => ['pending', 'approved'].includes(booking.status) && booking.end_at && booking.end_at < nowIso)
      .map(booking => booking.id)

    if (!expiredIds.length) return rows

    const { data, error: completeError } = await supabase
      .from('bookings')
      .update({ status: 'completed' })
      .in('id', expiredIds)
      .select('*')

    if (completeError) {
      setError(completeError.message)
      return rows
    }

    const completedById = Object.fromEntries((data || []).map(booking => [String(booking.id), booking]))
    return rows.map(booking => completedById[String(booking.id)] || booking)
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    const { start, end } = monthRange(month)
    const [
      venueResult,
      categoryResult,
      groupResult,
      itemResult,
      bookingResult,
      userResult,
    ] = await Promise.all([
      supabase.from('booking_venues').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('booking_equipment_categories').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('booking_equipment_groups').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('booking_equipment_items').select('*').eq('is_bookable', true).order('sort_order'),
      supabase
        .from('bookings')
        .select('*')
        .lt('start_at', end.toISOString())
        .gt('end_at', start.toISOString())
        .order('start_at', { ascending: true }),
      supabase.from('users').select('id, old_user_id, first_name, last_name, email').order('first_name'),
    ])

    const firstError = [venueResult, categoryResult, groupResult, itemResult, bookingResult, userResult].find(result => result.error)?.error
    if (firstError) {
      setError(firstError.message)
      setLoading(false)
      return
    }

    setVenues(venueResult.data || [])
    setCategories(categoryResult.data || [])
    setGroups(groupResult.data || [])
    setEquipmentItems(itemResult.data || [])
    const currentBookings = await completeExpiredBookings(bookingResult.data || [])
    setBookings(currentBookings)
    setUsers(userResult.data || [])

    const ids = currentBookings.map(booking => booking.id)
    if (ids.length) {
      const { data, error: itemError } = await supabase
        .from('booking_items')
        .select('booking_id, equipment_item_id, quantity')
        .in('booking_id', ids)
      if (itemError) setError(itemError.message)
      setBookingItems(data || [])
    } else {
      setBookingItems([])
    }
    setLoading(false)
  }, [completeExpiredBookings, month])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    let cancelled = false

    const checkAvailability = async () => {
      const hasValidRange = form.start_at && form.end_at && new Date(form.end_at) > new Date(form.start_at)
      if (!showForm || form.booking_type !== 'equipment' || !hasValidRange) {
        setUnavailableItemIds([])
        setCheckingAvailability(false)
        return
      }

      setCheckingAvailability(true)
      const startIso = new Date(form.start_at).toISOString()
      const endIso = new Date(form.end_at).toISOString()

      let conflictQuery = supabase
        .from('bookings')
        .select('id')
        .eq('booking_type', 'equipment')
        .in('status', ['pending', 'approved'])
        .lt('start_at', endIso)
        .gt('end_at', startIso)

      if (editingBooking?.id) conflictQuery = conflictQuery.neq('id', editingBooking.id)

      const { data: conflictingBookings, error: bookingError } = await conflictQuery

      if (cancelled) return
      if (bookingError) {
        setUnavailableItemIds([])
        setCheckingAvailability(false)
        setError(bookingError.message)
        return
      }

      const bookingIds = (conflictingBookings || []).map(booking => booking.id)
      if (!bookingIds.length) {
        setUnavailableItemIds([])
        setCheckingAvailability(false)
        return
      }

      const { data: rows, error: itemError } = await supabase
        .from('booking_items')
        .select('equipment_item_id')
        .in('booking_id', bookingIds)

      if (cancelled) return
      if (itemError) {
        setUnavailableItemIds([])
        setCheckingAvailability(false)
        setError(itemError.message)
        return
      }

      setUnavailableItemIds([...new Set((rows || []).map(row => row.equipment_item_id).filter(Boolean))])
      setCheckingAvailability(false)
    }

    checkAvailability()
    return () => { cancelled = true }
  }, [editingBooking?.id, form.booking_type, form.end_at, form.start_at, showForm])

  useEffect(() => {
    if (!unavailableItemIds.length) return
    setSelectedItems(prev => prev.filter(itemId => !unavailableItemIds.includes(itemId)))
  }, [unavailableItemIds])

  const openForm = (type = activeTab) => {
    const start = new Date()
    start.setMinutes(0, 0, 0)
    start.setHours(start.getHours() + 1)
    const end = new Date(start)
    end.setHours(end.getHours() + 1)
    setForm({
      ...emptyForm,
      booking_type: type,
      purpose: type === 'venue' ? 'Meeting' : 'Demo',
      start_at: localInputValue(start),
      end_at: localInputValue(end),
    })
    setSelectedItems([])
    setCategoryFilter('')
    setEquipmentSearch('')
    setUnavailableItemIds([])
    setEditingBooking(null)
    setError('')
    setShowForm(true)
  }

  const editBooking = (booking) => {
    const canEdit = isAdmin || String(booking.requested_by_user_id) === String(profile?.id)
    if (!canEdit || isClosedBooking(booking)) return

    setEditingBooking(booking)
    setForm({
      booking_type: booking.booking_type,
      venue_id: booking.venue_id ? String(booking.venue_id) : '',
      purpose: booking.purpose || (booking.booking_type === 'venue' ? 'Meeting' : 'Demo'),
      customer_name: booking.customer_name || '',
      start_at: localInputValue(new Date(booking.start_at)),
      end_at: localInputValue(new Date(booking.end_at)),
      notes: booking.notes || '',
    })
    setSelectedItems((itemsByBooking[String(booking.id)] || []).map(item => item.id))
    setCategoryFilter('')
    setEquipmentSearch('')
    setUnavailableItemIds([])
    setError('')
    setShowForm(true)
  }

  const toggleItem = (itemId) => {
    const item = itemsById[itemId]
    if (!item || isItemUnavailable(item)) return
    setSelectedItems(prev => prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId])
  }

  const selectCompleteSet = (group) => {
    const requiredIds = equipmentItems
      .filter(item => item.group_id === group.id && item.required_for_complete_set && !isItemUnavailable(item))
      .map(item => item.id)
    setSelectedItems(prev => [...new Set([...prev, ...requiredIds])])
  }

  const missingWarnings = useMemo(() => {
    const warnings = []
    groups.forEach(group => {
      const required = equipmentItems.filter(item => item.group_id === group.id && item.required_for_complete_set && !isItemUnavailable(item))
      const selected = required.filter(item => selectedItems.includes(item.id))
      if (selected.length > 0 && selected.length < required.length) {
        warnings.push({
          group,
          missing: required.filter(item => !selectedItems.includes(item.id)),
        })
      }
    })
    return warnings
  }, [equipmentItems, groups, isItemUnavailable, selectedItems])

  const saveBooking = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')

    if (form.booking_type === 'venue' && !form.venue_id) {
      setError('Please select a venue.')
      setSaving(false)
      return
    }
    if (form.booking_type === 'equipment' && selectedItems.length === 0) {
      setError('Please select at least one equipment item.')
      setSaving(false)
      return
    }
    if (!form.start_at || !form.end_at || new Date(form.end_at) <= new Date(form.start_at)) {
      setError('Please choose a valid start and end date/time.')
      setSaving(false)
      return
    }

    const payload = {
      booking_type: form.booking_type,
      venue_id: form.booking_type === 'venue' ? Number(form.venue_id) : null,
      requested_by_user_id: editingBooking?.requested_by_user_id || profile.id,
      requested_by_old_user_id: editingBooking?.requested_by_old_user_id || getLegacyUserId(profile),
      purpose: form.purpose || 'Other',
      customer_name: form.customer_name || null,
      start_at: new Date(form.start_at).toISOString(),
      end_at: new Date(form.end_at).toISOString(),
      status: 'approved',
      notes: form.notes || null,
    }

    const bookingMutation = editingBooking
      ? supabase.from('bookings').update(payload).eq('id', editingBooking.id).select().single()
      : supabase.from('bookings').insert([payload]).select().single()

    const { data: booking, error: bookingError } = await bookingMutation
    if (bookingError) {
      setError(bookingError.message)
      setSaving(false)
      return
    }

    if (form.booking_type === 'equipment') {
      if (editingBooking) {
        const { error: deleteItemError } = await supabase.from('booking_items').delete().eq('booking_id', booking.id)
        if (deleteItemError) {
          setError(deleteItemError.message)
          setSaving(false)
          return
        }
      }
      const { error: itemError } = await supabase.from('booking_items').insert(
        selectedItems.map(itemId => ({ booking_id: booking.id, equipment_item_id: itemId, quantity: 1 })),
      )
      if (itemError) {
        if (!editingBooking) await supabase.from('bookings').delete().eq('id', booking.id)
        setError(itemError.message)
        setSaving(false)
        return
      }
    } else if (editingBooking) {
      const { error: deleteItemError } = await supabase.from('booking_items').delete().eq('booking_id', booking.id)
      if (deleteItemError) {
        setError(deleteItemError.message)
        setSaving(false)
        return
      }
    }

    logActivity({
      module: 'booking',
      action: editingBooking ? 'update' : 'create',
      recordTable: 'bookings',
      recordId: booking.id,
      recordLabel: bookingTitle(booking, { venuesById, itemsByBooking }),
      summary: `${editingBooking ? 'Updated' : 'Created'} ${form.booking_type} booking`,
      metadata: { booking_type: form.booking_type, selected_items: selectedItems },
    })

    setShowForm(false)
    setEditingBooking(null)
    setSaving(false)
    await loadData()
  }

  const updateStatus = async (booking, status) => {
    setError('')
    const { error: statusError } = await supabase.from('bookings').update({ status }).eq('id', booking.id)
    if (statusError) {
      setError(statusError.message)
      return
    }
    logActivity({
      module: 'booking',
      action: 'status_change',
      recordTable: 'bookings',
      recordId: booking.id,
      recordLabel: bookingTitle(booking, { venuesById, itemsByBooking }),
      summary: `Changed booking status to ${status}`,
      metadata: { status },
    })
    await loadData()
  }

  const monthDays = calendarDays(month)
  const today = new Date()

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Booking</h1>
          <p className="text-sm text-gray-500 mt-1">Book meeting venues and demo/rental equipment without touching existing CRM records.</p>
        </div>
        <button onClick={() => openForm(activeTab)} className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700">
          <Plus size={16} /> New Booking
        </button>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {[
          ['venue', 'Venue Booking', MapPin],
          ['equipment', 'Equipment Booking', Package],
        ].map(([id, label, Icon]) => (
          <button key={id} onClick={() => setActiveTab(id)} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === id ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5">
        <div className="bg-white border border-gray-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="p-2 text-gray-500 hover:text-gray-800">
              <ChevronLeft size={18} />
            </button>
            <div className="flex items-center gap-2">
              <CalendarDays size={18} className="text-red-600" />
              <h2 className="font-semibold text-gray-900">{monthLabel(month)}</h2>
            </div>
            <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="p-2 text-gray-500 hover:text-gray-800">
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="px-2 py-2 text-center text-xs font-semibold text-gray-500">{day}</div>
            ))}
          </div>

          {loading ? (
            <div className="py-20 text-center text-sm text-gray-400">Loading bookings...</div>
          ) : (
            <div className="grid grid-cols-7">
              {monthDays.map(day => {
                const dayBookings = visibleBookings.filter(booking => {
                  const start = new Date(booking.start_at)
                  const end = new Date(booking.end_at)
                  return start <= new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59) &&
                    end >= new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0)
                })
                const inMonth = day.getMonth() === month.getMonth()
                return (
                  <div key={day.toISOString()} className={`min-h-28 border-r border-b border-gray-100 p-2 ${inMonth ? 'bg-white' : 'bg-gray-50'}`}>
                    <div className={`text-xs font-semibold mb-2 ${sameDay(day, today) ? 'text-red-600' : inMonth ? 'text-gray-700' : 'text-gray-300'}`}>
                      {day.getDate()}
                    </div>
                    <div className="space-y-1">
                      {dayBookings.slice(0, 3).map(booking => (
                        <button
                          key={booking.id}
                          type="button"
                          onClick={() => {
                            setSelectedCalendarBookingId(booking.id)
                            setShowAllBookings(false)
                          }}
                          className={`block w-full rounded px-2 py-1 text-left text-[11px] leading-tight transition ${
                            String(selectedCalendarBookingId) === String(booking.id) && !showAllBookings
                              ? 'bg-red-600 text-white'
                              : 'bg-red-50 text-red-700 hover:bg-red-100'
                          }`}
                        >
                          <div className="font-semibold truncate">{bookingTitle(booking, { venuesById, itemsByBooking })}</div>
                          <div className="truncate">{formatTime(booking.start_at)} {booking.purpose}</div>
                        </button>
                      ))}
                      {dayBookings.length > 3 && <div className="text-[11px] text-gray-400">+{dayBookings.length - 3} more</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-gray-900">{activeTab === 'venue' ? 'Venue' : 'Equipment'} Booking List</h2>
                <p className="text-xs text-gray-400">
                  {showAllBookings ? monthLabel(month) : selectedCalendarBookingId ? 'Selected calendar booking' : 'Select a booking from the calendar'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedCalendarBookingId(null)
                  setShowAllBookings(true)
                }}
                className="px-3 py-1.5 text-xs border border-gray-200 text-gray-700 hover:bg-gray-50"
              >
                Show All
              </button>
            </div>
          </div>
          <div className="divide-y divide-gray-100 max-h-[690px] overflow-y-auto">
            {loading ? (
              <div className="py-10 text-center text-sm text-gray-400">Loading...</div>
            ) : visibleBookings.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">No bookings this month.</div>
            ) : listBookings.length === 0 ? (
              <div className="py-10 px-4 text-center text-sm text-gray-400">
                Click a booking bubble in the calendar to view its details, or use Show All.
              </div>
            ) : listBookings.map(booking => {
              const owner = usersById[String(booking.requested_by_user_id)]
              const isOwner = String(booking.requested_by_user_id) === String(profile?.id)
              const canManage = (isAdmin || isOwner) && !isClosedBooking(booking)
              return (
                <div key={booking.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900">{bookingTitle(booking, { venuesById, itemsByBooking })}</p>
                      <p className="text-xs text-gray-500 mt-1">{formatDateTime(booking.start_at)} - {formatDateTime(booking.end_at)}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusStyles[booking.status] || statusStyles.pending}`}>
                      {statusLabel(booking.status)}
                    </span>
                  </div>
                  <div className="mt-3 text-xs text-gray-500 space-y-1">
                    <p><span className="font-medium">Purpose:</span> {booking.purpose}</p>
                    {booking.customer_name && <p><span className="font-medium">Customer:</span> {booking.customer_name}</p>}
                    <p><span className="font-medium">Booked By:</span> {displayName(owner)}</p>
                    {itemsByBooking[String(booking.id)]?.length > 0 && (
                      <p><span className="font-medium">Items:</span> {itemsByBooking[String(booking.id)].map(item => item.serial_no ? `${item.name} (${item.serial_no})` : item.name).join(', ')}</p>
                    )}
                    {booking.notes && <p><span className="font-medium">Notes:</span> {booking.notes}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {canManage && (
                      <button onClick={() => editBooking(booking)} className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-white border border-gray-200 text-gray-700 hover:bg-gray-50">
                        <Edit size={13} /> Edit
                      </button>
                    )}
                    {canManage && (
                      <button onClick={() => updateStatus(booking, 'cancelled')} className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-gray-200 text-gray-600 hover:bg-gray-50">
                        <X size={13} /> Cancel
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {error && <div className="border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4">
          <form onSubmit={saveBooking} className="bg-white w-full max-w-6xl my-8 border border-gray-200 shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{editingBooking ? 'Edit Booking' : 'New Booking'}</h2>
                <p className="text-xs text-gray-500">Booked by {displayName(profile)}</p>
              </div>
              <button type="button" onClick={() => { setShowForm(false); setEditingBooking(null) }} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
            </div>

            <div className="p-5 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <label className="space-y-1">
                  <span className="text-sm font-medium text-gray-700">Booking Type</span>
                  <select value={form.booking_type} onChange={e => {
                    setForm(f => ({ ...f, booking_type: e.target.value, venue_id: '', purpose: e.target.value === 'venue' ? 'Meeting' : 'Demo' }))
                    setSelectedItems([])
                  }} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
                    <option value="venue">Venue</option>
                    <option value="equipment">Equipment</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium text-gray-700">Purpose</span>
                  <select value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
                    {purposeOptions.map(option => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium text-gray-700">Start</span>
                  <input type="datetime-local" value={form.start_at} onChange={e => setForm(f => ({ ...f, start_at: e.target.value }))} required className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium text-gray-700">End</span>
                  <input type="datetime-local" value={form.end_at} onChange={e => setForm(f => ({ ...f, end_at: e.target.value }))} required className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="space-y-1">
                  <span className="text-sm font-medium text-gray-700">Customer / Visitor</span>
                  <input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} placeholder="Optional" className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium text-gray-700">Notes</span>
                  <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                </label>
              </div>

              {form.booking_type === 'venue' ? (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Select Venue</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {venues.map(venue => (
                      <label key={venue.id} className={`border p-3 cursor-pointer ${String(form.venue_id) === String(venue.id) ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                        <input type="radio" name="venue" className="sr-only" value={venue.id} checked={String(form.venue_id) === String(venue.id)} onChange={e => setForm(f => ({ ...f, venue_id: e.target.value }))} />
                        <span className="block font-semibold text-gray-900">{venue.name}</span>
                        <span className="text-xs text-gray-500">{venue.location || '—'}{venue.capacity ? ` · ${venue.capacity} pax` : ''}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_260px] gap-3">
                    <div className="relative">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input value={equipmentSearch} onChange={e => setEquipmentSearch(e.target.value)} placeholder="Search equipment, serial number, or location" className="w-full border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-green-500" />
                    </div>
                    <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="w-full border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-green-500">
                      <option value="">All Categories</option>
                      {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                    </select>
                  </div>

                  {checkingAvailability && (
                    <div className="text-xs text-gray-500">Checking selected date availability...</div>
                  )}

                  {missingWarnings.map(warning => (
                    <div key={warning.group.id} className="border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      <span className="font-semibold">{warning.group.name}</span> is only partly selected. Missing: {warning.missing.map(item => item.name).join(', ')}.
                    </div>
                  ))}

                  <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
                    <div className="max-h-[470px] overflow-y-auto space-y-3 pr-1">
                      {filteredGroups.length === 0 && (
                        <div className="border border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-400">
                          No equipment matched the current search.
                        </div>
                      )}
                      {filteredGroups.map(group => (
                        <div key={group.id} className="border border-gray-200 bg-white shadow-sm">
                          <div className="flex flex-wrap items-start justify-between gap-3 border-l-4 border-green-600 bg-gray-50 px-4 py-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-gray-900">{group.name}</p>
                                <span className="rounded-full bg-white border border-gray-200 px-2 py-0.5 text-[11px] text-gray-500">{categoriesById[group.category_id]?.name || group.category_id}</span>
                                {group.location && <span className="rounded-full bg-white border border-gray-200 px-2 py-0.5 text-[11px] text-gray-500">{group.location}</span>}
                              </div>
                              {group.booking_rule && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 mt-2 px-2 py-1">{group.booking_rule}</p>}
                            </div>
                            <button type="button" onClick={() => selectCompleteSet(group)} className="px-3 py-1.5 text-xs bg-white border border-green-200 text-green-700 hover:bg-green-50">
                              Book Complete Set
                            </button>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 p-4">
                            {group.items.map(item => {
                              const bookedForDate = unavailableItemSet.has(item.id)
                              const disabled = isItemUnavailable(item)
                              const selected = selectedItems.includes(item.id)
                              const cardClass = disabled
                                ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                                : selected
                                  ? 'border-green-500 bg-green-50 ring-1 ring-green-200 cursor-pointer'
                                  : 'border-gray-200 bg-white hover:border-green-300 hover:bg-green-50/50 cursor-pointer'
                              return (
                                <label key={item.id} className={`relative border p-3 transition ${cardClass}`}>
                                  <div className="flex items-start gap-3 pr-6">
                                    <input type="checkbox" disabled={disabled} checked={selected} onChange={() => toggleItem(item.id)} className="mt-1 accent-green-600 disabled:accent-gray-300" />
                                    <div className="min-w-0">
                                      <p className={`text-sm font-semibold leading-snug ${disabled ? 'text-gray-400' : 'text-gray-900'}`}>{item.name}</p>
                                      <div className="mt-2 flex flex-wrap gap-1.5">
                                        <span className={`rounded px-2 py-0.5 text-[11px] ${disabled ? 'bg-gray-200 text-gray-400' : 'bg-gray-100 text-gray-600'}`}>S/N: {item.serial_no || 'N/A'}</span>
                                        {item.location && <span className={`rounded px-2 py-0.5 text-[11px] ${disabled ? 'bg-gray-200 text-gray-400' : 'bg-gray-100 text-gray-600'}`}>{item.location}</span>}
                                      </div>
                                      <div className="flex flex-wrap gap-2 mt-2">
                                        {item.required_for_complete_set && <span className={`text-[11px] px-2 py-0.5 border ${disabled ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>Set Item</span>}
                                        <span className={`text-[11px] px-2 py-0.5 border ${disabled ? 'bg-gray-100 text-gray-500 border-gray-200' : itemStatusStyles[item.status] || itemStatusStyles.available}`}>
                                          {bookedForDate ? 'Booked selected date' : statusLabel(item.status)}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  {selected && <Check size={16} className="absolute right-3 top-3 text-green-600" />}
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    <aside className="border border-green-100 bg-green-50 p-4 h-fit lg:sticky lg:top-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-green-800">Selected Items</p>
                        <div className="flex items-center gap-2">
                          {selectedEquipmentItems.length > 0 && (
                            <button type="button" onClick={() => setSelectedItems([])} className="text-xs font-medium text-gray-500 hover:text-red-600">
                              Clear All
                            </button>
                          )}
                          <span className="rounded-full bg-white border border-green-200 px-2 py-0.5 text-xs font-semibold text-green-700">{selectedItems.length}</span>
                        </div>
                      </div>
                      {selectedEquipmentItems.length === 0 ? (
                        <p className="mt-3 text-xs text-gray-500">No item selected yet.</p>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {selectedEquipmentItems.map(item => (
                            <div key={item.id} className="flex items-start gap-2 rounded border border-green-100 bg-white px-3 py-2">
                              <button type="button" onClick={() => toggleItem(item.id)} className="min-w-0 flex-1 text-left text-xs text-green-700">
                                <span className="block truncate font-semibold">{item.name}</span>
                                <span className="block truncate text-green-600">{item.serial_no || 'No serial number'}</span>
                              </button>
                              <button type="button" onClick={() => toggleItem(item.id)} className="mt-0.5 shrink-0 rounded border border-green-100 p-1 text-green-700 hover:border-red-200 hover:bg-red-50 hover:text-red-600" aria-label={`Deselect ${item.name}`}>
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </aside>
                  </div>
                </div>
              )}

              {error && <div className="border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            </div>

            <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-200">
              <button type="button" onClick={() => { setShowForm(false); setEditingBooking(null) }} className="px-4 py-2 text-sm border border-gray-200 hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-60">
                {saving ? 'Saving...' : editingBooking ? 'Update Booking' : 'Save Booking'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
