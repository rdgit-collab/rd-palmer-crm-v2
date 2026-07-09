import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fetchAssignableUsers, fetchLegacyUsers } from '../lib/legacyUsers'

const TEN_MINUTES = 1000 * 60 * 10
const ONE_HOUR = 1000 * 60 * 60

async function fetchLookup(table, columns, orderField, options = {}) {
  let query = supabase.from(table).select(columns)
  if (options.eq) {
    Object.entries(options.eq).forEach(([column, value]) => {
      query = query.eq(column, value)
    })
  }
  if (orderField) query = query.order(orderField, { ascending: options.ascending ?? true })
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export function useLookup(table, columns = 'id, name', orderField = 'name', options = {}) {
  return useQuery({
    queryKey: ['lookup', table, columns, orderField, options],
    queryFn: () => fetchLookup(table, columns, orderField, options),
    staleTime: options.staleTime ?? TEN_MINUTES,
  })
}

export function useAssignableUsers() {
  return useQuery({
    queryKey: ['lookup', 'assignable-users'],
    queryFn: () => fetchAssignableUsers(supabase),
    staleTime: TEN_MINUTES,
  })
}

export function useLegacyUsers() {
  return useQuery({
    queryKey: ['lookup', 'legacy-users'],
    queryFn: () => fetchLegacyUsers(supabase),
    staleTime: TEN_MINUTES,
  })
}

export function useLeadSources() {
  return useLookup('lead', 'id, name', 'name')
}

export function useStages() {
  return useLookup('stage', 'id, name', 'name')
}

export function useIndustries() {
  return useLookup('industries', 'id, name', 'name', { staleTime: ONE_HOUR })
}

export function useAccountTypes() {
  return useLookup('account_type', 'id, type', 'type', { staleTime: ONE_HOUR })
}

export function useCountries() {
  return useLookup('country', 'id, name', 'name', { staleTime: ONE_HOUR })
}

export function useActivityTypes() {
  return useLookup('activity_type', 'id, type', 'type')
}

export function usePriorities() {
  return useLookup('priority', 'id, name', 'name')
}

export function useActivityStatuses() {
  return useLookup('activity_status', 'id, name', 'name')
}

export function usePaymentTerms() {
  return useLookup('payment_term', 'id, name', 'name')
}

export function useTaxes() {
  return useLookup('tax', 'id, name, rate', 'name')
}

export function useCategories() {
  return useLookup('category', 'id, name', 'name')
}

export function useServiceTypes() {
  return useLookup('service_type', 'id, type', 'type')
}

export function useSpares() {
  return useLookup('spare', 'id, name', 'name')
}

export function useVendors() {
  return useLookup('vendor', 'id, name', 'name')
}

export function useModes() {
  return useLookup('mode', 'id, name', 'name')
}
