import { useEffect, useMemo, useState } from 'react'
import { LegalPage, type LegalSection } from '../../components/public/LegalPage'
import { RichText } from '../../components/RichText'
import { usePageMeta } from '../../lib/usePageMeta'
import { api } from '../../lib/api'
import { PROVIDER_AGREEMENT_VERSION } from '../../../shared/providerAgreement'
import { DEFAULT_PROVIDER_AGREEMENT_SECTIONS, type ManagedAgreementSection } from '../../../shared/providerAgreementContent'

interface PublishedTemplate {
  name: string
  description: string | null
  version_label: string
  sections: ManagedAgreementSection[]
}

function legalSections(rows: ManagedAgreementSection[]): LegalSection[] {
  return rows.map((section) => ({
    id: section.id,
    title: section.title,
    content: <RichText source={section.body} />,
  }))
}

export default function ProviderAgreement() {
  usePageMeta('Independent Provider Network Agreement', 'Terms for independent professionals and service providers participating in the Pinnacle Management Ventures network.')
  const [template, setTemplate] = useState<PublishedTemplate>({
    name: 'Independent Provider Network Agreement',
    description: "One master agreement for the provider relationship, with clear work orders for each assignment. It applies across Pinnacle's property, field, document, notary, administrative, business, technology, and specialized professional network.",
    version_label: PROVIDER_AGREEMENT_VERSION,
    sections: DEFAULT_PROVIDER_AGREEMENT_SECTIONS,
  })

  useEffect(() => {
    api.get<{ template: PublishedTemplate }>('/managed-templates/provider-agreement')
      .then((result) => {
        if (result.template?.sections?.length) setTemplate(result.template)
      })
      .catch(() => {})
  }, [])

  const sections = useMemo(() => legalSections(template.sections), [template.sections])
  return <LegalPage eyebrow="Pinnacle Professional Network" title={template.name} intro={template.description || 'The current terms for participation in the Pinnacle Professional Network.'} updated={template.version_label} sections={sections}/>
}
