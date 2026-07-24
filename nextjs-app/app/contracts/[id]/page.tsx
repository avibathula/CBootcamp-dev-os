import { redirect } from 'next/navigation'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { ResultsLayout } from '@/components/contract/ResultsLayout'
import type { Contract, UserFeedback } from '@/types'

export default async function ContractResultsPage({ params }: { params: { id: string } }) {
  const supabase = await createServerSupabaseClient()

  const { data: contract, error } = await supabase
    .from('contracts')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !contract || contract.status !== 'complete') {
    redirect('/dashboard')
  }

  let signedUrl: string | null = null
  if (contract.file_path) {
    const serviceClient = createServiceRoleClient()
    const { data: signedUrlData } = await serviceClient.storage
      .from('contracts')
      .createSignedUrl(contract.file_path, 3600)
    signedUrl = signedUrlData?.signedUrl ?? null
  }

  const { data: existingFeedback } = await supabase
    .from('user_feedback')
    .select('*')
    .eq('contract_id', params.id)
    .maybeSingle()

  return (
    <ResultsLayout
      contract={contract as Contract}
      signedUrl={signedUrl}
      existingFeedback={(existingFeedback as UserFeedback) ?? null}
    />
  )
}
